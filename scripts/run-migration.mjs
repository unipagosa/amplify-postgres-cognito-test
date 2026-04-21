/**
 * Run the database migration against Aurora using the Data API.
 *
 * Usage:
 *   node scripts/run-migration.mjs                          # auto-detects the Amplify stack
 *   node scripts/run-migration.mjs <stack-name>             # specify stack name
 *   CLUSTER_ARN=... SECRET_ARN=... node scripts/run-migration.mjs  # specify ARNs directly
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import {
  CloudFormationClient,
  ListStacksCommand,
  ListStackResourcesCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

const DATABASE = "amplifydb";

async function findAmplifyStack() {
  const cf = new CloudFormationClient({});
  const res = await cf.send(
    new ListStacksCommand({
      StackStatusFilter: ["CREATE_COMPLETE", "UPDATE_COMPLETE"],
    })
  );
  const stacks = res.StackSummaries.filter(
    (s) => s.StackName.includes("amplify-") && !s.StackName.includes("sandbox")
  );
  if (stacks.length === 0) {
    throw new Error("No Amplify production stack found. Pass the stack name as an argument.");
  }
  if (stacks.length > 1) {
    console.log("Multiple Amplify stacks found:");
    stacks.forEach((s) => console.log(`  - ${s.StackName}`));
    console.log(`Using: ${stacks[0].StackName}`);
  }
  return stacks[0].StackName;
}

async function getArnsFromStack(stackName) {
  const cf = new CloudFormationClient({});

  const resources = await cf.send(new ListStackResourcesCommand({ StackName: stackName }));
  const todoStack = resources.StackResourceSummaries?.find((r) =>
    r.LogicalResourceId?.includes("TodoApiStack")
  );

  if (!todoStack?.PhysicalResourceId) {
    throw new Error(`Could not find TodoApiStack in ${stackName}`);
  }

  const details = await cf.send(
    new DescribeStacksCommand({ StackName: todoStack.PhysicalResourceId })
  );

  const outputs = details.Stacks?.[0]?.Outputs || [];
  const clusterArn = outputs.find((o) => o.OutputKey?.includes("ClusterArn"))?.OutputValue;
  const secretArn = outputs.find((o) => o.OutputKey?.includes("SecretArn"))?.OutputValue;

  return { clusterArn, secretArn };
}

async function main() {
  let clusterArn = process.env.CLUSTER_ARN;
  let secretArn = process.env.SECRET_ARN;

  if (!clusterArn || !secretArn) {
    const stackName = process.argv[2] || (await findAmplifyStack());
    console.log(`Using stack: ${stackName}`);
    const arns = await getArnsFromStack(stackName);
    clusterArn = arns.clusterArn;
    secretArn = arns.secretArn;
  }

  if (!clusterArn || !secretArn) {
    console.error("Could not determine CLUSTER_ARN or SECRET_ARN");
    process.exit(1);
  }

  console.log(`Cluster ARN: ${clusterArn}`);
  console.log(`Secret ARN:  ${secretArn}`);

  const rds = new RDSDataClient({});

  const statements = [
    `CREATE TABLE IF NOT EXISTS todo (
      id SERIAL PRIMARY KEY,
      content TEXT,
      is_done BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql`,
    `DROP TRIGGER IF EXISTS set_updated_at ON todo`,
    `CREATE TRIGGER set_updated_at BEFORE UPDATE ON todo FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`,
  ];

  for (const sql of statements) {
    console.log(`\nExecuting: ${sql.substring(0, 80)}...`);
    try {
      await rds.send(
        new ExecuteStatementCommand({
          resourceArn: clusterArn,
          secretArn: secretArn,
          database: DATABASE,
          sql,
        })
      );
      console.log("  ✓ Success");
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  console.log("\nMigration complete!");
}

main();
