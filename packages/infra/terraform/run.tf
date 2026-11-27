# What each deploy changes: the API service (B13b's PrimolarService, without the load balancer). Terraform owns its
# settings; .github/workflows/deploy.yml owns its image (ignore_changes below).
variable "initial_image_tag" {
  type        = string
  default     = ""
  description = "Only for the first apply that creates the service and the job: a commit SHA the deploy workflow has already pushed. Ignored afterwards."
}

resource "google_service_account" "api" {
  account_id   = local.names.api_account
  display_name = "Primolar API (Cloud Run service)"
}

resource "google_service_account" "release" {
  account_id   = local.names.release_account
  display_name = "Primolar release job (migrations, as the master user)"
}

resource "google_project_iam_member" "sql_client" {
  for_each = toset([google_service_account.api.email, google_service_account.release.email])
  project  = var.project_id
  role     = "roles/cloudsql.client"
  member   = "serviceAccount:${each.value}"
}

locals {
  socket = "/cloudsql/${google_sql_database_instance.main.connection_name}"
  # I4: built inside the container, so the password stays in Secret Manager. Phase 6: ?socket= is the driver's socketPath.
  database_url = "mysql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?socket=$DB_SOCKET"

  # #34: the API signs in as the DML-only app user once the release job has made it.
  api_user_secret = var.api_database_user == "app" ? "database_app" : "database"
  api_user_name   = var.api_database_user == "app" ? local.names.app_database_user : local.names.database_user

  # B13a's hand-off table (apps/api/README.md). COOKIE_SECURE keeps its default (true). PORT is set by Cloud Run.
  api_env = merge(
    {
      APP_ENV             = var.app_env
      CORS_ORIGIN         = join(",", var.web_origins)
      WEB_URL             = var.web_url
      S3_BUCKET           = google_storage_bucket.files.name
      S3_REGION           = "auto"
      S3_ENDPOINT         = "https://storage.googleapis.com"
      S3_FORCE_PATH_STYLE = "true"
      TRUST_PROXY_HOPS    = tostring(var.trust_proxy_hops)
      METRICS_INTERVAL_S  = "60"
      LOG_LEVEL           = "info"
      DEMO_LOGINS         = tostring(var.demo_logins)
      BACKGROUND_WORK     = "true" # I8: the one instance runs the jobs and the outbox
      SHUTDOWN_GRACE_MS   = "1000" # Cloud Run stops routing before SIGTERM and kills 10 s after it
      DB_USER             = local.api_user_name
      DB_NAME             = local.names.database
      DB_SOCKET           = local.socket
    },
    var.sms_sender_name == "" ? {} : { SMS_SENDER_NAME = var.sms_sender_name },
    var.demo_daily_reset ? { DEMO_DAILY_RESET = "true" } : {},
  )

  # Variable name → key of local.secret_ids (secrets.tf). Never a value.
  api_secrets = {
    DB_PASSWORD          = local.api_user_secret
    ORIGIN_SECRET        = "origin" # #2
    S3_ACCESS_KEY_ID     = "files_key_id"
    S3_SECRET_ACCESS_KEY = "files_secret"
  }
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = toset(values(local.api_secrets))
  secret_id = google_secret_manager_secret.generated[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_semaphore" {
  count     = var.semaphore_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.semaphore.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name                = local.names.service
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL" # Vercel's egress addresses aren't fixed
  deletion_protection = true

  template {
    service_account                  = google_service_account.api.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "60s" # the ALB's idle timeout on AWS
    max_instance_request_concurrency = 80

    # I8: one instance, always on. Scale to zero would stop the nightly jobs and the outbox (Follow Ups Q3).
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image   = "${local.image}:${var.initial_image_tag}"
      command = ["sh", "-c"]
      args    = ["export DATABASE_URL=\"${local.database_url}\" && exec node --enable-source-maps dist/main.mjs"]

      ports {
        container_port = local.api_port
      }

      resources {
        limits = {
          cpu    = var.api_cpu
          memory = var.api_memory
        }
        cpu_idle          = false # CPU always on: the jobs and the outbox run between requests
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.api_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.api_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.generated[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.semaphore_enabled ? ["SEMAPHORE_API_KEY"] : []
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.semaphore.secret_id
              version = "latest"
            }
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # I9: a revision takes traffic only once the database answers (B13a E5: 2 s bound inside the route).
      startup_probe {
        http_get {
          path = "/api/health/ready"
        }
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 24 # two minutes
      }

      # The container check: never touches the database.
      liveness_probe {
        http_get {
          path = "/api/health/live"
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    # I7: the deploy workflow sets the image (a commit SHA). Terraform never moves it back.
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  # The database user and every secret grant first, so a new revision never starts without them (also when
  # semaphore_enabled turns on in one apply).
  depends_on = [
    google_project_iam_member.sql_client,
    google_secret_manager_secret_iam_member.api,
    google_secret_manager_secret_iam_member.api_semaphore,
    google_secret_manager_secret_version.generated,
    google_sql_database.primolar,
    google_sql_user.master,
  ]
}

# Vercel calls without a Google identity. The API's origin check (#2) refuses anything but the web's proxy.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "api_url" {
  value       = google_cloud_run_v2_service.api.uri
  description = "Vercel API_PROXY_TARGET (no trailing slash)."
}
