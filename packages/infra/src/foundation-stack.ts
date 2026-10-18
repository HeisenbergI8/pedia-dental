import {
  CfnOutput, Duration, RemovalPolicy, Stack, type StackProps,
  aws_budgets as budgets, aws_certificatemanager as acm, aws_ec2 as ec2, aws_ecr as ecr, aws_iam as iam,
  aws_rds as rds, aws_s3 as s3, aws_sns as sns, aws_sns_subscriptions as subscriptions,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import { AVAILABILITY_ZONES, NAMES, type Settings } from "./config";

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
      allowAllOutbound: true, // ECR, Logs, Secrets Manager, Semaphore: through the internet gateway (I2)
    });
    this.databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSg", {
      vpc: this.vpc,
      description: "Primolar RDS: MySQL from the API tasks only",
      allowAllOutbound: false,
    });
    this.databaseSecurityGroup.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(3306), "MySQL from the API tasks");

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
    // I5: no TLS to RDS until the image carries the RDS CA bundle. Explicit, so a changed engine default can't break start-up.
    const parameterGroup = new rds.ParameterGroup(this, "DatabaseParameters", {
      engine,
      description: "Primolar MySQL 8.4",
      parameters: { require_secure_transport: "0" },
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
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\",
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
