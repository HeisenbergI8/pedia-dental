# Every setting, with the rules packages/infra/src/config.ts had (B13b). Values: terraform.tfvars (git-ignored),
# from terraform.tfvars.example. No secret is ever a variable: Terraform generates them (secrets.tf).

variable "project_id" {
  type        = string
  description = "The Google Cloud project id (not its name or number)."
}

variable "billing_account_id" {
  type        = string
  description = "The billing account the budget watches, like 0X0X0X-0X0X0X-0X0X0X."
  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    error_message = "billing_account_id must look like 0X0X0X-0X0X0X-0X0X0X (Billing → Account management)."
  }
}

variable "region" {
  type    = string
  default = "asia-southeast1"
  validation {
    condition     = var.region == "asia-southeast1"
    error_message = "Primolar's data stays in Singapore (asia-southeast1): the privacy notice and the DPA say so."
  }
}

variable "web_origins" {
  type        = list(string)
  description = "The web's https origins, for CORS_ORIGIN (no path, no trailing slash)."
  validation {
    condition     = length(var.web_origins) > 0 && alltrue([for o in var.web_origins : can(regex("^https://[a-z0-9.-]+(:[0-9]+)?$", o))])
    error_message = "web_origins must be https origins, like https://app.primolar.ph."
  }
}

variable "web_url" {
  type        = string
  description = "The web app's address: texted invite and reset links open it (WEB_URL)."
  validation {
    condition     = startswith(var.web_url, "https://")
    error_message = "web_url must be the web app's https:// address."
  }
}

variable "alert_email" {
  type    = string
  default = "alerts@primolar.ph"
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}

variable "github_repo" {
  type    = string
  default = "HeisenbergI8/pedia-dental"
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repo))
    error_message = "github_repo must be owner/name."
  }
}

variable "app_env" {
  type    = string
  default = "production"
  validation {
    condition     = contains(["demo", "production"], var.app_env)
    error_message = "app_env is demo or production."
  }
}

variable "demo_logins" {
  type    = bool
  default = false
  validation {
    condition     = !(var.demo_logins && var.app_env == "production")
    error_message = "demo_logins can't be true with app_env = production (the API refuses it too)."
  }
}

variable "demo_daily_reset" {
  type    = bool
  default = false
  validation {
    condition     = !var.demo_daily_reset || (var.app_env == "demo" && var.demo_logins)
    error_message = "demo_daily_reset needs app_env = demo and demo_logins = true (the API refuses it too)."
  }
}

variable "trust_proxy_hops" {
  type        = number
  default     = 2
  description = "Hops in X-Forwarded-For the API trusts: Vercel, then Google's front end. Measured at go-live (first-time setup)."
  validation {
    condition     = var.trust_proxy_hops >= 0 && var.trust_proxy_hops <= 3 && floor(var.trust_proxy_hops) == var.trust_proxy_hops
    error_message = "trust_proxy_hops is a whole number from 0 to 3."
  }
}

variable "api_database_user" {
  type        = string
  default     = "app"
  description = "#34: which MySQL user the API signs in as. master only until the release job has created the app user once."
  validation {
    condition     = contains(["app", "master"], var.api_database_user)
    error_message = "api_database_user is app or master."
  }
}

variable "api_cpu" {
  type        = string
  default     = "1"
  description = "vCPU of the one always-on API instance. Try 0.5 only if Cloud Run accepts it with CPU always on (Follow Ups Q4)."
}

variable "api_memory" {
  type    = string
  default = "1Gi"
}

variable "database_tier" {
  type        = string
  default     = "db-f1-micro"
  description = "Cloud SQL machine. db-f1-micro is shared-core (no SLA); db-g1-small is the next step up."
}

variable "semaphore_enabled" {
  type        = bool
  default     = false
  description = "I12: true only once the Semaphore key has a version in Secret Manager (first-time setup). An empty key stops the API."
}

variable "sms_sender_name" {
  type    = string
  default = ""
  validation {
    condition     = length(var.sms_sender_name) <= 11
    error_message = "sms_sender_name is at most 11 characters."
  }
}

variable "monthly_budget_amount" {
  type        = number
  default     = 80
  description = "The monthly budget, in the billing account's currency (budget_currency)."
}

variable "budget_currency" {
  type        = string
  default     = "USD"
  description = "Must be the billing account's own currency, or Google refuses the budget (Follow Ups Q8)."
}
