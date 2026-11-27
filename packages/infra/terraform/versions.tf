# Primolar on Google Cloud (replaces the AWS CDK app, B13b). Applied by the owner, by hand:
#   terraform -chdir=packages/infra/terraform init -backend-config="bucket=<project id>-tfstate"
#   terraform -chdir=packages/infra/terraform plan    (read it), then apply
# The deploy workflow never runs Terraform. It changes only the image of the service and the release job.
terraform {
  required_version = ">= 1.9"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # The bucket is given at init (above): private, versioned, uniform access, made in first-time setup step 2.
  # The state holds generated passwords and the HMAC secret, so only the owner may read it.
  backend "gcs" {
    prefix = "primolar"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  # The Billing Budgets API needs a quota project when the owner signs in with their own Google account.
  user_project_override = true
  billing_project       = var.project_id
}
