import {
  CfnOutput, CfnParameter, Duration, SecretValue, Stack, type StackProps,
  aws_cloudwatch as cloudwatch, aws_cloudwatch_actions as actions, aws_ec2 as ec2, aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2, aws_iam as iam, aws_logs as logs, aws_secretsmanager as secretsmanager,
  aws_wafv2 as wafv2,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import { API_PORT, NAMES, ORIGIN_HEADER, RDS_CA_BUNDLE, REGION, type Settings } from "./config";
import type { FoundationStack } from "./foundation-stack";

/**
 * Timings around the API's SIGTERM drain (B13a: SHUTDOWN_GRACE_MS = 12 s in apps/api/src/health/readiness.ts).
 * On stop, ECS deregisters the target and waits `deregistrationDelay`. Then SIGTERM: ready answers 503 for 12 s while
 * every route serves, and the app closes. SIGKILL comes at `stopTimeout`. test/service-stack.test.ts checks these
 * against the API's own constant (decisions.md I9).
 */
export const DRAIN = {
  healthCheckInterval: Duration.seconds(5),
  deregistrationDelay: Duration.seconds(30),
  stopTimeout: Duration.seconds(30),
} as const;

/** The container check (decisions.md I9): the same request as the Dockerfile's HEALTHCHECK, which ECS ignores. */
const LIVE_CHECK = `fetch('http://127.0.0.1:${API_PORT}/api/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))`;

/**
 * I4: DATABASE_URL built from its parts inside the container, so the password stays in Secrets Manager. `setup` runs
 * first, with DATABASE_URL set.
 */
export const withDatabaseUrl = (command: string, query = "", setup?: string) => [
  "sh", "-c", `export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME${query}" && ${setup ? `${setup} && ` : ""}exec ${command}`,
];

/**
 * #15: TLS to RDS, verified against the RDS CA bundle the image carries. Prisma's own parameter names: the API's
 * PrismaService (apps/api/src/prisma/prisma.service.ts) turns them into the mariadb driver's `ssl` option. With TLS,
 * MySQL 8.4's caching_sha2_password needs no RSA key, so `allowPublicKeyRetrieval` is gone.
 */
export const API_DATABASE_QUERY = `?sslcert=${RDS_CA_BUNDLE}&sslaccept=strict`;
/**
 * The release task's schema engine (`prisma migrate deploy`): encrypted, but it doesn't check the server's certificate.
 * Prisma's engine may read only the bundle's first certificate, and a failed check would stop every deploy. It runs
 * inside the VPC, to the database's private address only.
 */
export const RELEASE_DATABASE_QUERY = `?sslcert=${RDS_CA_BUNDLE}&sslaccept=accept_invalid_certs`;

/**
 * #34: creates the app user once and keeps its password in step with its secret, signed in as the master user, before
 * the migrations. Idempotent. The passwords exclude quotes and every character sh would read inside double quotes (I4).
 * TRUNCATE needs DROP: only a demo with the nightly reset (B13c1 E5) gets it.
 */
export const appUserSetup = (demoReset: boolean) => {
  const user = "'$APP_DB_USER'@'%'";
  const grants = `SELECT, INSERT, UPDATE, DELETE${demoReset ? ", DROP" : ""}`;
  const sql = `CREATE USER IF NOT EXISTS ${user} IDENTIFIED BY '$APP_DB_PASSWORD'; ALTER USER ${user} IDENTIFIED BY '$APP_DB_PASSWORD'; GRANT ${grants} ON $DB_NAME.* TO ${user};`;
  return `printf '%s' "${sql}" | node_modules/.bin/prisma db execute --stdin`;
};

export interface ServiceProps extends StackProps {
  settings: Settings;
  foundation: FoundationStack;
}

/** What each deploy changes (decisions.md I1): the cluster, the API's tasks and services, the ALB, logs and alarms. */
export class ServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id, props);
    const { settings, foundation } = props;
    const { vpc, bucket, repository, database, certificate, alerts, appSecurityGroup, appDatabaseSecret, originSecret, logsBucket } = foundation;

    // I7: the image per deploy, a commit SHA. deploy.yml passes both on every run.
    const tagPattern = "^[0-9a-f]{7,40}$";
    const imageTag = new CfnParameter(this, "ImageTag", { type: "String", allowedPattern: tagPattern, description: "Image tag (commit SHA) the API services run" });
    const releaseImageTag = new CfnParameter(this, "ReleaseImageTag", { type: "String", allowedPattern: tagPattern, description: "Image tag the release (migrate) task runs" });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc, clusterName: NAMES.cluster, containerInsightsV2: ecs.ContainerInsights.DISABLED });
    const logGroup = new logs.LogGroup(this, "Logs", { logGroupName: NAMES.logGroup, retention: logs.RetentionDays.THREE_MONTHS });

    // Fixed names: the deploy role may pass exactly these two (foundation-stack.ts, I16). CDK adds ECR pull, logs and
    // secret reads to the execution role as the containers below need them.
    const executionRole = new iam.Role(this, "ExecutionRole", { roleName: NAMES.executionRole, assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com") });
    const taskRole = new iam.Role(this, "TaskRole", {
      roleName: NAMES.taskRole,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "The Primolar API: its files in S3, nothing else",
    });
    // I6 (B12's open item): clinic files and Primolar's own (QR, sign-ups, receipts). ListBucket makes a missing key
    // answer NoSuchKey, which S3FileStorage.get expects; without it S3 answers 403.
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      resources: [bucket.arnForObjects("clinics/*"), bucket.arnForObjects("platform/*")],
    }));
    taskRole.addToPolicy(new iam.PolicyStatement({ actions: ["s3:ListBucket"], resources: [bucket.bucketArn] }));

    const databaseEnvironment = {
      DB_HOST: settings.databaseHostOverride ?? database.dbInstanceEndpointAddress, // I22: a restored copy, by setting
      DB_PORT: database.dbInstanceEndpointPort,
      DB_NAME: NAMES.databaseName,
    };
    const userSecrets = (secret: secretsmanager.ISecret) => ({
      DB_USER: ecs.Secret.fromSecretsManager(secret, "username"),
      DB_PASSWORD: ecs.Secret.fromSecretsManager(secret, "password"),
    });
    // #34: migrations (release task) as the master user; the services as the DML-only app user, once it exists.
    const masterSecrets = userSecrets(database.secret!);
    const apiDatabaseSecrets = settings.apiDatabaseUser === "app" ? userSecrets(appDatabaseSecret) : masterSecrets;
    // I12: only once the user has stored the key. An empty SEMAPHORE_API_KEY stops the API (env.ts: min(1)).
    const smsSecrets: Record<string, ecs.Secret> = settings.semaphoreSecretArn
      ? { SEMAPHORE_API_KEY: ecs.Secret.fromSecretsManager(secretsmanager.Secret.fromSecretCompleteArn(this, "Semaphore", settings.semaphoreSecretArn)) }
      : {};
    // B13a's hand-off table (apps/api/README.md). COOKIE_SECURE keeps its default (true).
    const apiEnvironment: Record<string, string> = {
      ...databaseEnvironment,
      APP_ENV: settings.appEnv,
      CORS_ORIGIN: settings.webOrigins.join(","),
      WEB_URL: settings.webUrl,
      S3_BUCKET: bucket.bucketName,
      S3_REGION: REGION,
      TRUST_PROXY_HOPS: String(settings.trustProxyHops),
      METRICS_INTERVAL_S: "60",
      LOG_LEVEL: "info",
      DEMO_LOGINS: String(settings.demoLogins),
      ...(settings.smsSenderName && { SMS_SENDER_NAME: settings.smsSenderName }),
    };
    const platform = { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX }; // I19

    const apiTask = (id: string, family: string, backgroundWork: boolean) => {
      const task = new ecs.FargateTaskDefinition(this, id, { family, cpu: 512, memoryLimitMiB: 1024, runtimePlatform: platform, taskRole, executionRole });
      task.addContainer("api", {
        image: ecs.ContainerImage.fromEcrRepository(repository, imageTag.valueAsString),
        command: withDatabaseUrl("node --enable-source-maps dist/main.mjs", API_DATABASE_QUERY),
        environment: {
          ...apiEnvironment,
          BACKGROUND_WORK: String(backgroundWork),
          // B13c1 E5: the reset is a job, so only the task that runs jobs carries it.
          ...(backgroundWork && settings.demoDailyReset && { DEMO_DAILY_RESET: "true" }),
        },
        // #2: the API refuses a request without this value in X-Primolar-Origin (apps/api/src/origin-check.ts).
        secrets: { ...apiDatabaseSecrets, ...smsSecrets, ORIGIN_SECRET: ecs.Secret.fromSecretsManager(originSecret) },
        portMappings: [{ containerPort: API_PORT }],
        logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: family }),
        healthCheck: {
          command: ["CMD", "node", "-e", LIVE_CHECK],
          interval: Duration.seconds(30),
          timeout: Duration.seconds(5),
          retries: 3,
          startPeriod: Duration.seconds(30),
        },
        stopTimeout: DRAIN.stopTimeout,
      });
      return task;
    };

    // B13a E4: the same image, one command: migrate, then exit. deploy.yml runs it before the services update.
    const release = new ecs.FargateTaskDefinition(this, "ReleaseTask", {
      family: NAMES.releaseFamily, cpu: 256, memoryLimitMiB: 512, runtimePlatform: platform, taskRole, executionRole,
    });
    release.addContainer("release", {
      image: ecs.ContainerImage.fromEcrRepository(repository, releaseImageTag.valueAsString),
      command: withDatabaseUrl("node_modules/.bin/prisma migrate deploy", RELEASE_DATABASE_QUERY, appUserSetup(settings.demoDailyReset)),
      environment: databaseEnvironment,
      secrets: {
        ...masterSecrets,
        APP_DB_USER: ecs.Secret.fromSecretsManager(appDatabaseSecret, "username"),
        APP_DB_PASSWORD: ecs.Secret.fromSecretsManager(appDatabaseSecret, "password"),
      },
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: NAMES.releaseFamily }),
    });

    // The tasks' group, referenced by id: the ALB -> task rule then lives in this stack. Passing the foundation's
    // construct puts the rule in PrimolarFoundation, pointing at this stack's ALB group: a cross-stack cycle.
    const taskSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, "TaskSg", appSecurityGroup.securityGroupId);
    // I8: `api` is the only task with BACKGROUND_WORK=true, and it is never scaled. Growth adds `api-web` tasks.
    const serviceDefaults = {
      cluster,
      assignPublicIp: true, // I2: no NAT gateway
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [taskSecurityGroup],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
    };
    const worker = new ecs.FargateService(this, "Worker", {
      ...serviceDefaults, serviceName: "api", desiredCount: 1, taskDefinition: apiTask("WorkerTask", NAMES.workerFamily, true),
    });
    const web = new ecs.FargateService(this, "Web", {
      ...serviceDefaults, serviceName: "api-web", desiredCount: settings.extraWebTasks, taskDefinition: apiTask("WebTask", NAMES.webFamily, false),
    });

    // I10: HTTPS only; port 80 redirects. Open to the internet: Vercel's egress addresses aren't fixed.
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSg", { vpc, description: "Primolar ALB", allowAllOutbound: false });
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc, internetFacing: true, vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, securityGroup: albSecurityGroup, dropInvalidHeaderFields: true,
    });
    alb.addRedirect({ sourcePort: 80, targetPort: 443 });
    // #36: access logs under alb/ in the foundation's log bucket.
    alb.logAccessLogs(logsBucket, "alb");
    // #2, the origin lock: only the web's /api proxy (Vercel) knows the origin secret. Anything else, including a caller
    // that skips Vercel to choose its own X-Forwarded-For, gets 403 here, and again from the API (origin-check.ts).
    // The rule's value is a CloudFormation dynamic reference: the template never holds the secret, but the listener
    // rule does, so anyone allowed elasticloadbalancing:DescribeRules in the account can read it (accepted: the
    // account's administrators can read the secret anyway). The ALB's health checks go to the target group directly.
    const https = alb.addListener("Https", {
      port: 443, protocol: elbv2.ApplicationProtocol.HTTPS, certificates: [certificate], sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS, open: true,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, { contentType: "text/plain", messageBody: "Forbidden" }),
    });
    const originValue = SecretValue.secretsManager(NAMES.originSecret).unsafeUnwrap();
    const targets = https.addTargets("Api", {
      priority: 10,
      conditions: [elbv2.ListenerCondition.httpHeader(ORIGIN_HEADER, [originValue])],
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [worker, web],
      deregistrationDelay: DRAIN.deregistrationDelay,
      healthCheck: {
        path: "/api/health/ready", // B13a E5: checks the database (2 s bound); 503 while draining
        interval: DRAIN.healthCheckInterval,
        timeout: Duration.seconds(3),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        healthyHttpCodes: "200",
      },
    });

    if (settings.waf) this.addWaf(alb, settings.wafBlock);

    // I13: B13a's EMF metrics (namespace Primolar/API, dimension Service=api) and the ALB's own.
    const apiMetric = (metricName: string, statistic: string, period = Duration.minutes(1)) =>
      new cloudwatch.Metric({ namespace: "Primolar/API", metricName, dimensionsMap: { Service: "api" }, statistic, period });
    const alarms = [
      new cloudwatch.Alarm(this, "UnhandledErrors", {
        alarmName: "primolar-api-unhandled-errors",
        alarmDescription: "An unexpected error was logged. Logs Insights: 'Primolar errors by fingerprint'.",
        metric: apiMetric("UnhandledErrors", "Sum"),
        threshold: 0,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "OutboxStuck", {
        alarmName: "primolar-api-outbox-stuck",
        alarmDescription: "The oldest due outbox row is over 10 minutes old, or service `api` (BACKGROUND_WORK=true) stopped reporting.",
        metric: apiMetric("OutboxOldestSeconds", "Maximum", Duration.minutes(5)),
        threshold: 600,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      }),
      new cloudwatch.Alarm(this, "NoHealthyTask", {
        alarmName: "primolar-api-no-healthy-task",
        alarmDescription: "No task has passed /api/health/ready for 3 minutes.",
        metric: targets.metrics.healthyHostCount({ statistic: "Minimum", period: Duration.minutes(1) }),
        threshold: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 3,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      }),
    ];
    const notify = new actions.SnsAction(alerts);
    for (const alarm of alarms) {
      alarm.addAlarmAction(notify);
      alarm.addOkAction(notify);
    }
    // A sign-in to Primolar's console emails the alert address, so one that wasn't us is seen at once. An alarm emails
    // when it turns on, so sign-ins in the same or back-to-back minutes share one email. No "OK" email: only noise.
    new cloudwatch.Alarm(this, "ConsoleSignIn", {
      alarmName: "primolar-console-sign-in",
      alarmDescription: "Someone signed in to Primolar's console. If it wasn't one of us, change the password and reset two-step sign-in now.",
      metric: apiMetric("ConsoleSignIns", "Sum"),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);
    // B13a E7: errors grouped by their stable fingerprint.
    new logs.QueryDefinition(this, "ErrorsByFingerprint", {
      queryDefinitionName: "Primolar errors by fingerprint",
      logGroups: [logGroup],
      queryString: new logs.QueryString({
        filterStatements: ["ispresent(fingerprint)"],
        statsStatements: ["count(*) as errors, latest(@timestamp) as last by fingerprint"],
        sort: "errors desc",
        limit: 50,
      }),
    });

    // deploy.yml reads these (decisions.md I15).
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ReleaseTaskDefinitionArn", { value: release.taskDefinitionArn });
    new CfnOutput(this, "TaskSubnetIds", { value: vpc.publicSubnets.map((subnet) => subnet.subnetId).join(",") });
    new CfnOutput(this, "TaskSecurityGroupId", { value: appSecurityGroup.securityGroupId });
    new CfnOutput(this, "ImageTagInUse", { value: imageTag.valueAsString });
    new CfnOutput(this, "LoadBalancerDnsName", { value: alb.loadBalancerDnsName, description: "The API's domain points here (CNAME)" });
  }

  /**
   * #36: AWS's common rule set, and a per-address limit on /api/auth/* above the API's own sign-in limits (a second
   * line, not the first). Every request arrives from Vercel, so the address is X-Forwarded-For's first entry, which
   * Vercel sets. Two body rules only count: uploads are bigger than the 8 KB they allow, and clinical notes may hold `<`.
   */
  private addWaf(alb: elbv2.ApplicationLoadBalancer, block: boolean) {
    const visibility = (metricName: string) => ({ cloudWatchMetricsEnabled: true, metricName, sampledRequestsEnabled: true });
    const acl = new wafv2.CfnWebACL(this, "Waf", {
      name: "primolar-api",
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: visibility("primolar-api"),
      rules: [
        {
          name: "aws-common",
          priority: 0,
          overrideAction: block ? { none: {} } : { count: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
              ruleActionOverrides: ["SizeRestrictions_BODY", "CrossSiteScripting_BODY"].map((name) => ({ name, actionToUse: { count: {} } })),
            },
          },
          visibilityConfig: visibility("primolar-api-common"),
        },
        {
          name: "auth-rate",
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 300,
              evaluationWindowSec: 300,
              aggregateKeyType: "FORWARDED_IP",
              forwardedIpConfig: { headerName: "X-Forwarded-For", fallbackBehavior: "NO_MATCH" },
              scopeDownStatement: {
                byteMatchStatement: {
                  fieldToMatch: { uriPath: {} },
                  positionalConstraint: "STARTS_WITH",
                  searchString: "/api/auth/",
                  textTransformations: [{ priority: 0, type: "NONE" }],
                },
              },
            },
          },
          visibilityConfig: visibility("primolar-api-auth-rate"),
        },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, "WafAlb", { resourceArn: alb.loadBalancerArn, webAclArn: acl.attrArn });
  }
}
