# I16 (B13b) on Google Cloud: GitHub Actions (deploy.yml) signs in with OIDC through Workload Identity Federation,
# only from this repository's `production` environment on master, and acts as primolar-deploy. No key is stored.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = local.names.github_pool
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = local.names.github_provider
  display_name                       = "This repository"
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.environment" = "assertion.environment"
    "attribute.ref"         = "assertion.ref"
  }
  # Tokens from anywhere else are refused before any role is looked at.
  attribute_condition = "assertion.repository == '${var.github_repo}' && assertion.environment == '${local.names.github_env}' && assertion.ref == 'refs/heads/master'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  account_id   = local.names.deploy_account
  display_name = "GitHub Actions deploy.yml, environment production only"
}

resource "google_service_account_iam_member" "deploy_from_github" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/repo:${var.github_repo}:environment:${local.names.github_env}"
}

# Push images (tags are immutable, registry.tf), and check that a rollback's tag exists.
resource "google_artifact_registry_repository_iam_member" "deploy_push" {
  location   = var.region
  repository = google_artifact_registry_repository.api.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}

# Change the service's image and run the release job: these two resources only.
resource "google_cloud_run_v2_service_iam_member" "deploy" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_cloud_run_v2_job_iam_member" "deploy" {
  name     = google_cloud_run_v2_job.release.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

# A new revision runs as the API's account and the job as the release account: the deployer must be allowed to
# hand them over (AWS: iam:PassRole on exactly two roles).
resource "google_service_account_iam_member" "deploy_acts_as" {
  for_each           = { api = google_service_account.api.name, release = google_service_account.release.name }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

# `gcloud run jobs execute --wait` and `services update` poll long-running operations, which are project-level reads.
resource "google_project_iam_member" "deploy_run_viewer" {
  project = var.project_id
  role    = "roles/run.viewer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

output "github_workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "GitHub environment `production` variable GCP_WORKLOAD_IDENTITY_PROVIDER"
}

output "github_deploy_service_account" {
  value       = google_service_account.deploy.email
  description = "GitHub environment `production` variable GCP_DEPLOY_SERVICE_ACCOUNT"
}
