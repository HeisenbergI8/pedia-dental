import {
  CfnOutput, Duration, RemovalPolicy, Stack, type StackProps,
  aws_budgets as budgets, aws_certificatemanager as acm, aws_ec2 as ec2, aws_ecr as ecr, aws_iam as iam,
  aws_logs as logs, aws_rds as rds, aws_s3 as s3, aws_secretsmanager as secretsmanager, aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import { AVAILABILITY_ZONES, NAMES, type Settings } from "./config";

/** I4: the passwords go into a URL inside sh double quotes (and the app user's into SQL quotes), so never these. */
export const DATABASE_PASSWORD_EXCLUDED = " %+~`#$&*()|[]{}:;<>?!'/@\"\\";

export interface FoundationProps extends StackProps {
  settings: Settings;
}

/**
 * What survives every deploy (decisions.md I1): network, files, images, the database, the certificate, alerts, the
 * budget and the deploy role. Changes here are rare and reviewed: `cdk diff PrimolarFoundation` first.
 */
export class FoundationStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly appSecurityGroup: ec2.SecurityGroup;
  readonly databaseSecurityGroup: ec2.SecurityGroup;
  readonly bucket: s3.Bucket;
  readonly logsBucket: s3.Bucket;
  readonly originSecret: secretsmanager.Secret;
  readonly appDatabaseSecret: secretsmanager.Secret;
  readonly repository: ecr.Repository;
  readonly database: rds.DatabaseInstance;
  readonly certificate: acm.ICertificate;
  readonly alerts: sns.Topic;

  constructor(scope: Construct, id: string, props: FoundationProps) {
    super(scope, id, props);
    const { settings } = props;

    // I2: two AZs (an ALB and an RDS subnet group both need two). Public subnets hold the ALB and the tasks, which get
    // a public IP instead of a NAT gateway. Isolated subnets hold RDS, with no route out. S3 goes through a free gateway endpoint.
    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.40.0.0/16"),
      availabilityZones: AVAILABILITY_ZONES,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });

    // Both groups live here, so the database rule never points from this stack into PrimolarService (no cycle).
    this.appSecurityGroup = new ec2.SecurityGroup(this, "AppSg", {
      vpc: this.vpc,
      description: "Primolar API tasks: in from the load balancer only (rule added by PrimolarService)",
      // #36: ECR, Logs, Secrets Manager, S3 and Semaphore are all HTTPS (through the internet gateway, I2, or S3's
      // gateway endpoint); MySQL goes to the database's group. Nothing else leaves. DNS (the VPC resolver) isn't filtered.
      allowAllOutbound: false,
    });
    this.appSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS: AWS APIs and Semaphore");
    this.databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSg", {
      vpc: this.vpc,
      description: "Primolar RDS: MySQL from the API tasks only",
      allowAllOutbound: false,
    });
    this.databaseSecurityGroup.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(3306), "MySQL from the API tasks");
    this.appSecurityGroup.addEgressRule(this.databaseSecurityGroup, ec2.Port.tcp(3306), "MySQL to the database");

    // #36: the load balancer's access logs (PrimolarService adds its prefix) and the files bucket's server access logs.
    // Private, TLS-only, 90 days (as the API's log group).
    this.logsBucket = new s3.Bucket(this, "AccessLogs", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED, // the only encryption ALB access logs accept
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ id: "expire-90-days", expiration: Duration.days(90), abortIncompleteMultipartUploadAfter: Duration.days(7) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // I6: private, encrypted, versioned. Current files never expire; old versions go after 35 days (> the 30-day restore window).
    this.bucket = new s3.Bucket(this, "Files", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [
        { id: "old-versions-35-days", noncurrentVersionExpiration: Duration.days(35), abortIncompleteMultipartUploadAfter: Duration.days(7) },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
      serverAccessLogsBucket: this.logsBucket,
      serverAccessLogsPrefix: "s3-files/",
    });

    // I7: one tag per commit SHA, never overwritten; the 30 newest are kept as rollback targets.
    this.repository = new ecr.Repository(this, "Repository", {
      repositoryName: NAMES.repository,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [{ description: "Keep the 30 newest images (rollback targets)", maxImageCount: 30 }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // I3: MySQL 8.4, single-AZ, 30 days of backups and point-in-time restore. CloudFormation refuses a bare "8.4" (Q4), so
    // the newest 8.4 minor this aws-cdk-lib knows; autoMinorVersionUpgrade below moves it forward in maintenance windows.
    const engine = rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_4_10 });
    // #15: TLS required (the image carries the RDS CA bundle; databaseRequireTls=false only during the move to it).
    // Slow queries (over 2 s) go to a log file, exported below.
    const parameterGroup = new rds.ParameterGroup(this, "DatabaseParameters", {
      engine,
      description: "Primolar MySQL 8.4",
      parameters: {
        require_secure_transport: settings.databaseRequireTls ? "1" : "0",
        slow_query_log: "1",
        long_query_time: "2",
        log_output: "FILE",
      },
    });
    const subnetGroup = new rds.SubnetGroup(this, "DatabaseSubnets", {
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      description: "Primolar RDS: isolated subnets",
    });
    this.database = new rds.DatabaseInstance(this, "Database", {
      engine,
      parameterGroup,
      subnetGroup,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: this.vpc,
      securityGroups: [this.databaseSecurityGroup],
      multiAz: false,
      publiclyAccessible: false,
      databaseName: NAMES.databaseName,
      // I4: the password goes into a URL inside sh double quotes, so it must never hold these.
      credentials: rds.Credentials.fromGeneratedSecret(NAMES.databaseUser, {
        secretName: NAMES.databaseSecret,
        excludeCharacters: DATABASE_PASSWORD_EXCLUDED,
      }),
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      backupRetention: Duration.days(30),
      preferredBackupWindow: "18:00-18:30", // 02:00 Manila
      preferredMaintenanceWindow: "sun:19:00-sun:19:30", // Monday 03:00 Manila
      deleteAutomatedBackups: false,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      autoMinorVersionUpgrade: true,
      enablePerformanceInsights: false,
      // #36: MySQL's error and slow-query logs in CloudWatch (/aws/rds/instance/<id>/…), kept as long as the API's.
      cloudwatchLogsExports: ["error", "slowquery"],
      cloudwatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
    });

    // #34: the services' own user, SELECT, INSERT, UPDATE and DELETE on the schema. The release task, signed in as the
    // master user, creates it and keeps its password in step with this secret (service-stack.ts).
    this.appDatabaseSecret = new secretsmanager.Secret(this, "AppDatabaseSecret", {
      secretName: NAMES.appDatabaseSecret,
      description: "Primolar API's MySQL user (DML only)",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: NAMES.appDatabaseUser }),
        generateStringKey: "password",
        passwordLength: 32,
        excludeCharacters: DATABASE_PASSWORD_EXCLUDED,
      },
    });

    // #2: the origin lock. The web's /api proxy sends it (Vercel env ORIGIN_SECRET, copied there by hand); the load
    // balancer forwards only requests that carry it, and the API checks it again. Letters and digits only: an ALB
    // header condition reads * and ? as wildcards.
    this.originSecret = new secretsmanager.Secret(this, "OriginSecret", {
      secretName: NAMES.originSecret,
      description: "Primolar: header X-Primolar-Origin from the web's /api proxy (Vercel ORIGIN_SECRET)",
      generateSecretString: { passwordLength: 64, excludePunctuation: true, includeSpace: false },
    });

    // I10: the domain is the user's. DNS validation without a Route 53 zone: the CNAME is added by hand during the
    // first deploy of this stack (first-time setup runbook). Or import a certificate that already exists.
    this.certificate = settings.certificateArn
      ? acm.Certificate.fromCertificateArn(this, "Certificate", settings.certificateArn)
      : new acm.Certificate(this, "Certificate", { domainName: settings.apiDomain, validation: acm.CertificateValidation.fromDns() });

    // I13, I14: one topic for the alarms and the budget; one email confirmation.
    this.alerts = new sns.Topic(this, "Alerts", { displayName: "Primolar alerts" });
    this.alerts.addSubscription(new subscriptions.EmailSubscription(settings.alertEmail));
    this.alerts.addToResourcePolicy(new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal("budgets.amazonaws.com")],
      actions: ["sns:Publish"],
      resources: [this.alerts.topicArn],
      conditions: { StringEquals: { "aws:SourceAccount": this.account } },
    }));
    const notice = (notificationType: "ACTUAL" | "FORECASTED", threshold: number) => ({
      notification: { notificationType, comparisonOperator: "GREATER_THAN", threshold, thresholdType: "PERCENTAGE" },
      subscribers: [{ subscriptionType: "SNS", address: this.alerts.topicArn }],
    });
    new budgets.CfnBudget(this, "Budget", {
      budget: {
        budgetName: NAMES.budget,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: settings.monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [notice("ACTUAL", 80), notice("FORECASTED", 100)],
    });

    // I16: GitHub Actions (deploy.yml) signs in with OIDC, only from this repository's `production` environment.
    const github = settings.githubOidcProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, "GithubOidc", settings.githubOidcProviderArn)
      : new iam.OidcProviderNative(this, "GithubOidc", {
          url: "https://token.actions.githubusercontent.com",
          clientIds: ["sts.amazonaws.com"],
        });
    const deployRole = new iam.Role(this, "DeployRole", {
      roleName: NAMES.deployRole,
      description: "GitHub Actions deploy.yml, environment production only",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.oidcProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${settings.githubRepo}:environment:${NAMES.githubEnvironment}`,
        },
      }),
    });
    this.repository.grantPullPush(deployRole);
    this.repository.grant(deployRole, "ecr:DescribeImages"); // a rollback checks its tag exists
    const arn = (service: string, resource: string, region: string = this.region) =>
      `arn:${this.partition}:${service}:${region}:${this.account}:${resource}`;
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask"],
      resources: [arn("ecs", `task-definition/${NAMES.releaseFamily}:*`)],
      conditions: { ArnEquals: { "ecs:cluster": arn("ecs", `cluster/${NAMES.cluster}`) } },
    }));
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ecs:DescribeTasks"],
      resources: [arn("ecs", `task/${NAMES.cluster}/*`)],
    }));
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [NAMES.taskRole, NAMES.executionRole].map((name) => arn("iam", `role/${name}`, "")),
      conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
    }));
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["cloudformation:DescribeStacks"],
      resources: [arn("cloudformation", `stack/${NAMES.serviceStack}/*`)],
    }));
    // `cdk deploy` in the workflow works through CDK's bootstrap roles (CloudFormation, assets), never with this role's own rights.
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ["sts:AssumeRole"],
      resources: [arn("iam", `role/cdk-hnb659fds-*-${this.account}-${this.region}`, "")],
    }));

    new CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn, description: "GitHub environment `production` variable AWS_DEPLOY_ROLE_ARN" });
    new CfnOutput(this, "RepositoryUri", { value: this.repository.repositoryUri });
    new CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "DatabaseInstanceId", { value: this.database.instanceIdentifier, description: "restore drill: the source instance" });
    new CfnOutput(this, "DatabaseSubnetGroup", { value: subnetGroup.subnetGroupName, description: "restore drill: where the copy goes" });
    new CfnOutput(this, "DatabaseSecurityGroupId", { value: this.databaseSecurityGroup.securityGroupId, description: "restore drill: the copy's security group" });
  }
}
