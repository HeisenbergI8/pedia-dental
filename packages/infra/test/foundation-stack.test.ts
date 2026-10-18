import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { exampleStacks, statementsOf } from "./support/stacks";

const foundationOf = (overrides: Record<string, unknown> = {}) => Template.fromStack(exampleStacks(overrides).foundation);

describe("PrimolarFoundation", () => {
  let template: Template;
  beforeAll(() => {
    template = foundationOf();
  });

  it("has no NAT gateway; S3 goes through a gateway endpoint (I2)", () => {
    template.resourceCountIs("AWS::EC2::NatGateway", 0);
    template.resourceCountIs("AWS::EC2::Subnet", 4);
    template.hasResourceProperties("AWS::EC2::VPCEndpoint", { VpcEndpointType: "Gateway" });
    template.resourceCountIs("AWS::EC2::VPCEndpoint", 1);
  });

  it("runs MySQL 8.4 single-AZ, private, encrypted, with 30 days of point-in-time restore (I3)", () => {
    template.hasResource("AWS::RDS::DBInstance", {
      DeletionPolicy: "Snapshot",
      Properties: Match.objectLike({
        Engine: "mysql", EngineVersion: "8.4.10", DBInstanceClass: "db.t4g.micro", DBName: "primolar",
        MultiAZ: false, PubliclyAccessible: false, StorageEncrypted: true, StorageType: "gp3",
        BackupRetentionPeriod: 30, DeleteAutomatedBackups: false, DeletionProtection: true,
      }),
    });
    template.hasResourceProperties("AWS::RDS::DBParameterGroup", { Family: "mysql8.4", Parameters: { require_secure_transport: "0" } });
  });

  it("admits MySQL only from the API tasks' security group", () => {
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      IpProtocol: "tcp", FromPort: 3306, ToPort: 3306,
      SourceSecurityGroupId: { "Fn::GetAtt": [Match.stringLikeRegexp("^AppSg"), "GroupId"] },
    });
    expect(JSON.stringify(template.findResources("AWS::EC2::SecurityGroup"))).not.toContain("0.0.0.0/0\",\"FromPort\":3306");
  });

  it("generates a password that is safe in a URL and inside sh double quotes (I4)", () => {
    const [secret] = Object.values(template.findResources("AWS::SecretsManager::Secret"));
    const excluded = secret!.Properties.GenerateSecretString.ExcludeCharacters as string;
    for (const ch of [" ", "/", "@", ":", "$", "\"", "\\", "`", "%", "?", "#"]) expect(excluded).toContain(ch);
    expect(secret!.Properties.Name).toBe("primolar/database");
  });

  it("keeps files private, encrypted, versioned and TLS-only, without CORS; current files never expire (I6)", () => {
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      Properties: Match.objectLike({
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
        VersioningConfiguration: { Status: "Enabled" },
        CorsConfiguration: Match.absent(),
        LifecycleConfiguration: { Rules: [Match.objectLike({ NoncurrentVersionExpiration: { NoncurrentDays: 35 }, ExpirationInDays: Match.absent() })] },
      }),
    });
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } })]) },
    });
  });

  it("keeps images by commit SHA, immutable, scanned, the newest 30 (I7)", () => {
    template.hasResource("AWS::ECR::Repository", {
      DeletionPolicy: "Retain",
      Properties: Match.objectLike({
        RepositoryName: "primolar-api", ImageTagMutability: "IMMUTABLE", ImageScanningConfiguration: { ScanOnPush: true },
        LifecyclePolicy: { LifecyclePolicyText: Match.stringLikeRegexp('"countNumber":30') },
      }),
    });
  });

  it("emails the alert topic, and the budget publishes to it (I13, I14)", () => {
    template.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "alerts@example.com" });
    template.hasResourceProperties("AWS::SNS::TopicPolicy", {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Principal: { Service: "budgets.amazonaws.com" }, Action: "sns:Publish" })]) },
    });
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({ BudgetType: "COST", TimeUnit: "MONTHLY", BudgetLimit: { Amount: 100, Unit: "USD" } }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Notification: Match.objectLike({ NotificationType: "ACTUAL", Threshold: 80 }) }),
        Match.objectLike({ Notification: Match.objectLike({ NotificationType: "FORECASTED", Threshold: 100 }) }),
      ]),
    });
  });

  it("requests a DNS-validated certificate for the API's domain, unless one is imported (I10)", () => {
    template.hasResourceProperties("AWS::CertificateManager::Certificate", { DomainName: "api.example.com", ValidationMethod: "DNS" });
    foundationOf({ certificateArn: "arn:aws:acm:ap-southeast-1:123456789012:certificate/abc" })
      .resourceCountIs("AWS::CertificateManager::Certificate", 0);
  });

  it("lets only this repository's production environment assume the deploy role; no stored keys (I16)", () => {
    template.hasResourceProperties("AWS::IAM::OIDCProvider", { Url: "https://token.actions.githubusercontent.com", ClientIdList: ["sts.amazonaws.com"] });
    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "primolar-github-deploy",
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: { StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": "repo:HeisenbergI8/pedia-dental:environment:production",
          } },
        })],
      },
    });
    template.resourceCountIs("AWS::IAM::User", 0);
    template.resourceCountIs("AWS::IAM::AccessKey", 0);
    foundationOf({ githubOidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" })
      .resourceCountIs("AWS::IAM::OIDCProvider", 0);
  });

  it("limits the deploy role to the release task, the two task roles and CDK's bootstrap roles", () => {
    // ecr:GetAuthorizationToken has no resource-level permissions: AWS requires "*" for it, and only it.
    const statements = statementsOf(template, "DeployRole");
    expect(statements.filter((s) => s.Resource === "*")).toEqual([{ Action: "ecr:GetAuthorizationToken", Effect: "Allow", Resource: "*" }]);
    const text = JSON.stringify(statements.filter((s) => s.Action !== "ecr:GetAuthorizationToken"));
    expect(text).not.toMatch(/"(\*|ecs:\*|iam:\*|s3:\*|rds:\*)"/);
    expect(text).toContain("task-definition/primolar-api-release:*");
    expect(text).toContain("ecs-tasks.amazonaws.com");
    expect(text).toContain("role/cdk-hnb659fds-*-");
  });
});
