import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";

const rdsData = new RDSDataClient({});
const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!;
const DATABASE = process.env.DATABASE_NAME || "amplifydb";

const STATEMENTS = [
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

export async function handler(event: { RequestType: string; PhysicalResourceId?: string }) {
  console.log("Migration event:", JSON.stringify(event));

  // Only run on Create and Update, not Delete
  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId || "migration" };
  }

  for (const sql of STATEMENTS) {
    console.log(`Executing: ${sql.substring(0, 80)}...`);
    try {
      await rdsData.send(
        new ExecuteStatementCommand({
          resourceArn: CLUSTER_ARN,
          secretArn: SECRET_ARN,
          database: DATABASE,
          sql,
        })
      );
      console.log("  ✓ Success");
    } catch (err) {
      console.error(`  ✗ Error:`, err);
      throw err;
    }
  }

  return { PhysicalResourceId: "migration-v1" };
}
