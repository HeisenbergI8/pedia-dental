# I3 (B13b), on Cloud SQL: MySQL 8.4, one zone, 30 daily backups and point-in-time recovery, deletion protection.
# Encrypted at rest by Google (no setting). No authorized networks: only the Cloud SQL connector reaches it
# (Cloud Run's built-in connection, or cloud-sql-proxy on the owner's machine for a restore drill).
resource "google_sql_database_instance" "main" {
  name                = local.names.sql_instance
  database_version    = "MYSQL_8_4"
  region              = var.region
  deletion_protection = true # Terraform refuses to destroy it

  settings {
    edition                     = "ENTERPRISE"
    tier                        = var.database_tier
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    disk_autoresize_limit       = 100
    deletion_protection_enabled = true # Google refuses to delete it, from any tool

    backup_configuration {
      enabled                        = true
      binary_log_enabled             = true    # point-in-time recovery
      start_time                     = "18:00" # UTC = 02:00 Manila
      transaction_log_retention_days = 7       # the most Cloud SQL Enterprise keeps
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day  = 7  # Sunday, UTC
      hour = 19 # 19:00 UTC Sunday = Monday 03:00 Manila
    }

    ip_configuration {
      ipv4_enabled = true # the connector's way in; no authorized networks, so no address can connect directly
      # #15 on Cloud SQL: only connections with a client certificate, which only the connector has.
      ssl_mode = "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"
    }

    # #36: slow queries (over 2 s) to a file, which Cloud SQL sends to Cloud Logging.
    database_flags {
      name  = "slow_query_log"
      value = "on"
    }
    database_flags {
      name  = "long_query_time"
      value = "2"
    }
    database_flags {
      name  = "log_output"
      value = "FILE"
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_sql_database" "primolar" {
  name      = local.names.database
  instance  = google_sql_database_instance.main.name
  charset   = "utf8mb4"
  collation = "utf8mb4_0900_ai_ci" # MySQL 8.4's default, as on RDS
}

# I4: letters and digits only. It goes into a URL inside sh double quotes, and the app user's into SQL quotes.
resource "random_password" "database" {
  length  = 32
  special = false
}

# The master user: the release job signs in as it (migrations, the app user's setup). In secrets.tf as primolar-database.
resource "google_sql_user" "master" {
  name     = local.names.database_user
  instance = google_sql_database_instance.main.name
  host     = "%"
  password = random_password.database.result
}

output "sql_connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "project:region:instance. The socket is /cloudsql/<this>. The restore drill and cloud-sql-proxy use it."
}
