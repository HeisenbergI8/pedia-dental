# I6 (B13b) on Cloud Storage: private, versioned, in Singapore. Current files never expire; old versions go after
# 35 days (more than the 30-day restore window). The API reaches it through the S3-compatible XML API
# (S3_ENDPOINT=https://storage.googleapis.com) with this file's HMAC key: no API code change.
resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-primolar-files"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 35
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.enabled]
}

# The HMAC key's owner: objects in this bucket only. Never the API's runtime account.
resource "google_service_account" "files" {
  account_id   = local.names.files_account
  display_name = "Primolar files (the API's HMAC key for the files bucket)"
}

resource "google_storage_bucket_iam_member" "files_objects" {
  bucket = google_storage_bucket.files.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.files.email}"
}

# S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (secrets.tf). Rotate: first-time setup, "Rotating the files key".
resource "google_storage_hmac_key" "files" {
  service_account_email = google_service_account.files.email
}

# #36's server access logs, on Cloud Storage: who read or wrote which file, in Cloud Logging (90 days, monitoring.tf).
resource "google_project_iam_audit_config" "storage" {
  project = var.project_id
  service = "storage.googleapis.com"
  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

output "files_bucket" {
  value = google_storage_bucket.files.name
}
