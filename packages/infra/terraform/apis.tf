# The Google APIs Primolar uses. Kept on when this file changes (disable_on_destroy = false): turning an API off
# can delete what runs on it.
locals {
  services = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ]

  # Fixed names (B13b decisions.md I1): .github/workflows/deploy.yml and the runbooks use them. Change them together;
  # packages/infra/test/support/terraform.ts lists them for the tests.
  names = {
    registry        = "primolar"
    image           = "primolar-api"
    service         = "primolar-api"
    release_job     = "primolar-release"
    api_account     = "primolar-api"
    release_account = "primolar-release"
    files_account   = "primolar-files"
    deploy_account  = "primolar-deploy"
    sql_instance    = "primolar-db"
    database        = "primolar"
    database_user   = "primolar"
    # #34: the API's own MySQL user (DML only), created by the release job as the master user.
    app_database_user = "primolar_app"
    github_pool       = "github"
    github_provider   = "primolar-repo"
    github_env        = "production"
    budget            = "primolar-monthly"
  }

  image = "${var.region}-docker.pkg.dev/${var.project_id}/${local.names.registry}/${local.names.image}"
  # The API's port (apps/api/Dockerfile EXPOSE 4100, env.ts PORT default). Cloud Run sets PORT to it.
  api_port = 4100
}

data "google_project" "this" {}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}
