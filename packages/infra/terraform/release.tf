# B13a E4: the same image, one command: create or update the app user, migrate, exit. deploy.yml runs it before
# the service moves. Signed in as the master user; only this job's account may read that password.
locals {
  app_user = "'$APP_DB_USER'@'%'"
  # TRUNCATE needs DROP: only a demo with the nightly reset (B13c1 E5) gets it.
  app_grants   = var.demo_daily_reset ? "SELECT, INSERT, UPDATE, DELETE, DROP" : "SELECT, INSERT, UPDATE, DELETE"
  app_user_sql = "CREATE USER IF NOT EXISTS ${local.app_user} IDENTIFIED BY '$APP_DB_PASSWORD'; ALTER USER ${local.app_user} IDENTIFIED BY '$APP_DB_PASSWORD'; GRANT ${local.app_grants} ON $DB_NAME.* TO ${local.app_user};"
  release_command = join(" && ", [
    "export DATABASE_URL=\"${local.database_url}\"",
    "printf '%s' \"${local.app_user_sql}\" | node_modules/.bin/prisma db execute --stdin",
    "exec node_modules/.bin/prisma migrate deploy",
  ])
}

resource "google_secret_manager_secret_iam_member" "release" {
  for_each  = toset(["database", "database_app"])
  secret_id = google_secret_manager_secret.generated[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.release.email}"
}

resource "google_cloud_run_v2_job" "release" {
  name                = local.names.release_job
  location            = var.region
  deletion_protection = false # holds no data; the workflow updates it on every deploy

  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.release.email
      max_retries     = 0 # a failed migration stops the deploy; never run it twice by itself
      timeout         = "900s"

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      containers {
        image   = "${local.image}:${var.initial_image_tag}"
        command = ["sh", "-c"]
        args    = [local.release_command]

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "DB_USER"
          value = local.names.database_user
        }
        env {
          name  = "DB_NAME"
          value = local.names.database
        }
        env {
          name  = "DB_SOCKET"
          value = local.socket
        }
        env {
          name  = "APP_DB_USER"
          value = local.names.app_database_user
        }
        env {
          name = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.generated["database"].secret_id
              version = "latest"
            }
          }
        }
        env {
          name = "APP_DB_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.generated["database_app"].secret_id
              version = "latest"
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_iam_member.sql_client, google_secret_manager_secret_iam_member.release, google_sql_user.master]
}
