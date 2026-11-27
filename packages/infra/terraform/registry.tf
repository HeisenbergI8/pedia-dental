# I7 (B13b) on Artifact Registry: one tag per commit SHA, never overwritten; the 30 newest are rollback targets.
resource "google_artifact_registry_repository" "api" {
  repository_id = local.names.registry
  location      = var.region
  format        = "DOCKER"
  description   = "Primolar API images, tagged by commit SHA"

  docker_config {
    immutable_tags = true
  }

  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-30-newest"
    action = "KEEP"
    most_recent_versions {
      keep_count = 30
    }
  }
  cleanup_policies {
    id     = "delete-the-rest"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  depends_on = [google_project_service.enabled]
}
