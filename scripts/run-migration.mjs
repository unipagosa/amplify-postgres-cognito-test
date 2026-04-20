/**
 * Run the database migration against Aurora using the Data API.
 * 
 * Usage:
 *   node scripts/run-migration.mjs
 */

import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";
import { CloudFormationClient, ListStackResourcesCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";

const STACK_NAME = "amplify-awsamplifygen2-fgil-sandbox-32db6ee9eb";
const DATABASE = "amplifydb";

async function getOutputsFromNestedStack() {
  const cf = new CloudFormationClient({});
  
  const resources = await cf.send(new ListStackResourcesCommand({ StackName: STACK_NAME }));
  const auroraStack = resources.StackResourceSummaries?.find(r => 
    r.LogicalResourceId?.includes("AuroraPostgresStack")
  );
  
  if (!auroraStack?.PhysicalResourceId) {
    throw new Error("Could not find AuroraPostgresStack nested stack");
  }

  const stackDetails = await cf.send(new DescribeStacksCommand({ 
    StackName: auroraStack.PhysicalResourceId 
  }));
  
  const outputs = stackDetails.Stacks?.[0]?.Outputs || [];
  const clusterArn = outputs.find(o => o.OutputKey?.includes("ClusterArn"))?.OutputValue;
  const secretArn = outputs.find(o => o.OutputKey?.includes("SecretArn"))?.OutputValue;
  
  return { clusterArn, secretArn };
}

async function main() {
  let clusterArn = process.env.CLUSTER_ARN;
  let secretArn = process.env.SECRET_ARN;

  if (!clusterArn || !secretArn) {
    console.log("Fetching ARNs from CloudFormation...");
    const arns = await getOutputsFromNestedStack();
    clusterArn = arns.clusterArn;
    secretArn = arns.secretArn;
  }

  if (!clusterArn || !secretArn) {
    console.error("Could not determine CLUSTER_ARN or SECRET_ARN");
    process.exit(1);
  }

  console.log(`Cluster ARN: ${clusterArn}`);
  console.log(`Secret ARN: ${secretArn}`);

  const rds = new RDSDataClient({});

  // Run each SQL statement individually (Data API requires single statements)
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
      await rds.send(new ExecuteStatementCommand({
        resourceArn: clusterArn,
        secretArn: secretArn,
        database: DATABASE,
        sql,
      }));
      console.log("  ✓ Success");
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  console.log("\nMigration complete!");
}

main();
