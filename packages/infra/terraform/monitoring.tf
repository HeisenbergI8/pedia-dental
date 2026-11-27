# I13 (B13b) on Cloud Monitoring: the API's EMF lines (apps/api/src/metrics/metrics.service.ts) arrive in Cloud
# Logging as jsonPayload. Counter log-based metrics count the lines that cross a line; alert policies email
# alert_email. Plus the health check and 90 days of logs.
resource "google_monitoring_notification_channel" "email" {
  display_name = "Primolar alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.enabled]
}

locals {
  api_logs = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.names.service}\""
  log_metrics = {
    unhandled_errors = { field = "jsonPayload.UnhandledErrors>0", about = "Metrics lines with an unhandled error in their minute" }
    console_sign_ins = { field = "jsonPayload.ConsoleSignIns>0", about = "Metrics lines with a sign-in to Primolar's console" }
    outbox_stuck     = { field = "jsonPayload.OutboxOldestSeconds>600", about = "Metrics lines whose oldest due outbox row is over 10 minutes old" }
    texts_held       = { field = "jsonPayload.TextsHeldDailyCap>0", about = "Metrics lines with a text deferred by Primolar's daily cap across all clinics" }
    # Only the BACKGROUND_WORK instance writes OutboxOldestSeconds: no line for 10 minutes = it stopped reporting.
    outbox_reports = { field = "jsonPayload.OutboxOldestSeconds>=0", about = "Metrics lines from the instance that runs the outbox" }
  }
  metric_type = { for key, metric in google_logging_metric.api : key => "logging.googleapis.com/user/${metric.name}" }

  # Threshold alerts: a matching line in the window. `prompts`: the console sign-in and the held texts send no
  # "closed" email (AWS: no OK action).
  line_alerts = {
    unhandled_errors = {
      name    = "primolar-api-unhandled-errors"
      window  = "60s"
      prompts = ["OPENED", "CLOSED"]
      doc     = "An unexpected error was logged. Logs Explorer: the errors-by-fingerprint query in packages/infra/runbooks/deploy.md."
    }
    outbox_stuck = {
      name    = "primolar-api-outbox-stuck"
      window  = "300s"
      prompts = ["OPENED", "CLOSED"]
      doc     = "The oldest due outbox row is over 10 minutes old: texts are not going out."
    }
    console_sign_ins = {
      name    = "primolar-console-sign-in"
      window  = "60s"
      prompts = ["OPENED"]
      doc     = "Someone signed in to Primolar's console. If it wasn't one of us, change the password and reset two-step sign-in now."
    }
    texts_held = {
      name    = "primolar-texts-held-daily-cap"
      window  = "60s"
      prompts = ["OPENED"]
      doc     = "Texts reached Primolar's daily cap across all clinics and are waiting for tomorrow. Check the message log for a clinic sending far more than usual."
    }
  }
}

resource "google_logging_metric" "api" {
  for_each    = local.log_metrics
  name        = "primolar/${replace(each.key, "_", "-")}"
  description = each.value.about
  filter      = "${local.api_logs} AND ${each.value.field}"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "line" {
  for_each     = local.line_alerts
  display_name = each.value.name
  combiner     = "OR"
  documentation {
    content   = each.value.doc
    mime_type = "text/markdown"
  }
  conditions {
    display_name = "${each.value.name}: a matching line"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"${local.metric_type[each.key]}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = each.value.window
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }
  alert_strategy {
    auto_close           = "1800s"
    notification_prompts = each.value.prompts
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# The outbox alarm's "missing data = alarm" half: the background instance stopped writing its metrics lines.
resource "google_monitoring_alert_policy" "outbox_silent" {
  display_name = "primolar-api-outbox-silent"
  combiner     = "OR"
  documentation {
    content   = "No outbox metrics for 10 minutes: the API instance that runs background work is down or stuck."
    mime_type = "text/markdown"
  }
  conditions {
    display_name = "No OutboxOldestSeconds line for 10 minutes"
    condition_absent {
      filter   = "resource.type = \"cloud_run_revision\" AND metric.type = \"${local.metric_type["outbox_reports"]}\""
      duration = "600s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# I9's load-balancer check, from outside: /api/health/ready answers 200 only while the database answers.
resource "google_monitoring_uptime_check_config" "ready" {
  display_name     = "primolar-api-ready"
  timeout          = "10s"
  period           = "60s"
  selected_regions = ["ASIA_PACIFIC", "USA_OREGON", "EUROPE"]
  http_check {
    path         = "/api/health/ready"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    accepted_response_status_codes {
      status_value = 200
    }
  }
  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimsuffix(trimprefix(google_cloud_run_v2_service.api.uri, "https://"), "/")
    }
  }
}

resource "google_monitoring_alert_policy" "not_ready" {
  display_name = "primolar-api-not-ready"
  combiner     = "OR"
  documentation {
    content   = "/api/health/ready has failed for 3 minutes: the API or its database is down."
    mime_type = "text/markdown"
  }
  conditions {
    display_name = "Ready check failing"
    condition_threshold {
      filter          = "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type = \"uptime_url\" AND metric.label.check_id = \"${google_monitoring_uptime_check_config.ready.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "180s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
      trigger {
        count = 1
      }
    }
  }
  alert_strategy {
    auto_close = "1800s"
  }
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# The API's log group kept 90 days on AWS. Cloud Logging's default bucket keeps 30; this makes it 90 for the project.
resource "google_logging_project_bucket_config" "default" {
  project        = var.project_id
  location       = "global"
  bucket_id      = "_Default"
  retention_days = 90
}
