# Every secret the API and the release job read. Generated here (in Terraform's state: the state bucket is the
# owner's only), replicated only in Singapore. The Semaphore key is added by hand (first-time setup).
resource "random_password" "database_app" {
  length  = 32
  special = false # I4: it goes into SQL quotes and sh double quotes
}

# #2: the web's /api proxy sends it in X-Primolar-Origin (Vercel ORIGIN_SECRET, copied there by hand).
resource "random_password" "origin" {
  length  = 64
  special = false
}

locals {
  secret_ids = {
    database     = "primolar-database"
    database_app = "primolar-database-app"
    origin       = "primolar-origin-secret"
    files_key_id = "primolar-files-hmac-id"
    files_secret = "primolar-files-hmac-secret"
  }
  secret_values = {
    database     = random_password.database.result
    database_app = random_password.database_app.result
    origin       = random_password.origin.result
    files_key_id = google_storage_hmac_key.files.access_id
    files_secret = google_storage_hmac_key.files.secret
  }
}

resource "google_secret_manager_secret" "generated" {
  for_each  = local.secret_ids
  secret_id = each.value
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "generated" {
  for_each    = local.secret_ids
  secret      = google_secret_manager_secret.generated[each.key].id
  secret_data = local.secret_values[each.key]
}

# I12: the key is added by hand once Semaphore approves the account (gcloud secrets versions add), then
# semaphore_enabled = true. Until then the API uses its log driver.
resource "google_secret_manager_secret" "semaphore" {
  secret_id = "primolar-semaphore"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.enabled]
}
