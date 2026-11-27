# I14 (B13b) on Cloud Billing: 80% of actual spend and 100% of forecast email alert_email, and the billing
# account's admins (Google's default). It warns; it never stops anything.
resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = local.names.budget

  budget_filter {
    projects               = ["projects/${data.google_project.this.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "EXCLUDE_ALL_CREDITS" # the trial's credits hide nothing
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.monthly_budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.id]
    disable_default_iam_recipients   = false
  }

  depends_on = [google_project_service.enabled]
}
