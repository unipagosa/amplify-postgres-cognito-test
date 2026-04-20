-- Initial schema for the Todo app on Aurora Postgres.
-- Run this against your database after the Aurora cluster is deployed:
--   aws rds-data execute-statement \
--     --resource-arn <cluster-arn> \
--     --secret-arn <secret-arn> \
--     --database amplifydb \
--     --sql "$(cat amplify/migrations/001_create_todo.sql)"

CREATE TABLE IF NOT EXISTS todo (
  id SERIAL PRIMARY KEY,
  content TEXT,
  is_done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON todo;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON todo
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
