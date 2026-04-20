import {
  RDSDataClient,
  ExecuteStatementCommand,
  SqlParameter,
  Field,
  ColumnMetadata,
} from "@aws-sdk/client-rds-data";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

const rdsData = new RDSDataClient({});
const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!;
const DATABASE = process.env.DATABASE_NAME || "amplifydb";

async function executeSql(sql: string, parameters: SqlParameter[] = []) {
  const command = new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE,
    sql,
    parameters,
    includeResultMetadata: true,
  });
  return rdsData.send(command);
}

function rowsToObjects(
  records: Field[][] | undefined,
  columnMetadata: ColumnMetadata[] | undefined
): Record<string, unknown>[] {
  const columns = (columnMetadata || []).map((c) => c.name || "");
  return (records || []).map((row) => {
    const obj: Record<string, unknown> = {};
    row.forEach((field, i) => {
      const col = columns[i] || `col${i}`;
      if ("stringValue" in field) obj[col] = field.stringValue;
      else if ("longValue" in field) obj[col] = field.longValue;
      else if ("booleanValue" in field) obj[col] = field.booleanValue;
      else if ("isNull" in field) obj[col] = null;
      else obj[col] = null;
    });
    return obj;
  });
}

function response(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;

  try {
    // GET /todos - list all
    if (method === "GET" && rawPath === "/todos") {
      const result = await executeSql(
        "SELECT id, content, is_done, created_at, updated_at FROM todo ORDER BY created_at DESC"
      );
      return response(200, rowsToObjects(result.records, result.columnMetadata));
    }

    // GET /todos/{id}
    if (method === "GET" && rawPath.startsWith("/todos/")) {
      const id = rawPath.split("/")[2];
      const result = await executeSql(
        "SELECT id, content, is_done, created_at, updated_at FROM todo WHERE id = :id",
        [{ name: "id", value: { longValue: parseInt(id, 10) } }]
      );
      const rows = rowsToObjects(result.records, result.columnMetadata);
      if (rows.length === 0) return response(404, { error: "Not found" });
      return response(200, rows[0]);
    }

    // POST /todos - create
    if (method === "POST" && rawPath === "/todos") {
      const body = JSON.parse(event.body || "{}");
      const result = await executeSql(
        "INSERT INTO todo (content, is_done) VALUES (:content, :isDone) RETURNING id, content, is_done, created_at, updated_at",
        [
          { name: "content", value: { stringValue: body.content || "" } },
          { name: "isDone", value: { booleanValue: body.isDone ?? false } },
        ]
      );
      return response(201, rowsToObjects(result.records, result.columnMetadata)[0]);
    }

    // PUT /todos/{id} - update
    if (method === "PUT" && rawPath.startsWith("/todos/")) {
      const id = rawPath.split("/")[2];
      const body = JSON.parse(event.body || "{}");

      const sets: string[] = [];
      const params: SqlParameter[] = [
        { name: "id", value: { longValue: parseInt(id, 10) } },
      ];

      if (body.content !== undefined) {
        sets.push("content = :content");
        params.push({ name: "content", value: { stringValue: body.content } });
      }
      if (body.isDone !== undefined) {
        sets.push("is_done = :isDone");
        params.push({ name: "isDone", value: { booleanValue: body.isDone } });
      }

      if (sets.length === 0) return response(400, { error: "No fields to update" });

      const result = await executeSql(
        `UPDATE todo SET ${sets.join(", ")}, updated_at = NOW() WHERE id = :id RETURNING id, content, is_done, created_at, updated_at`,
        params
      );
      const rows = rowsToObjects(result.records, result.columnMetadata);
      if (rows.length === 0) return response(404, { error: "Not found" });
      return response(200, rows[0]);
    }

    // DELETE /todos/{id}
    if (method === "DELETE" && rawPath.startsWith("/todos/")) {
      const id = rawPath.split("/")[2];
      const result = await executeSql(
        "DELETE FROM todo WHERE id = :id RETURNING id",
        [{ name: "id", value: { longValue: parseInt(id, 10) } }]
      );
      const rows = rowsToObjects(result.records, result.columnMetadata);
      if (rows.length === 0) return response(404, { error: "Not found" });
      return response(200, { deleted: true });
    }

    return response(404, { error: "Not found" });
  } catch (err) {
    console.error("Error:", err);
    return response(500, { error: "Internal server error" });
  }
}
