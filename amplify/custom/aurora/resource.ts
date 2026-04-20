import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export class AuroraPostgresConstruct extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly vpc: ec2.Vpc;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // VPC for Aurora and Lambda
    this.vpc = new ec2.Vpc(this, "AuroraVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private-isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // VPC endpoints so Lambda in isolated subnets can reach AWS services
    this.vpc.addInterfaceEndpoint("RdsDataEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.RDS_DATA,
    });
    this.vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    // Security group for the Aurora cluster
    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for Aurora Postgres cluster",
      allowAllOutbound: true,
    });

    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      "Allow Postgres access from within VPC"
    );

    // Aurora Serverless v2 Postgres cluster
    // Uses the default AWS-managed encryption key for Secrets Manager
    // which the Data API can access without extra KMS grants
    this.cluster = new rds.DatabaseCluster(this, "AuroraPostgresCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("dbadmin"),
      defaultDatabaseName: "amplifydb",
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [this.dbSecurityGroup],
      writer: rds.ClusterInstance.serverlessV2("writer"),
      enableDataApi: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    new cdk.CfnOutput(this, "ClusterArn", {
      value: this.cluster.clusterArn,
    });

    new cdk.CfnOutput(this, "SecretArn", {
      value: this.cluster.secret?.secretArn || "",
    });
  }
}
