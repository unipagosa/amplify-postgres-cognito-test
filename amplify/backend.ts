import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource.js";
import { AuroraPostgresConstruct } from "./custom/aurora/resource.js";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cdk from "aws-cdk-lib";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const backend = defineBackend({
  auth,
});

// Single stack for Aurora + API to avoid circular dependencies
const apiStack = backend.createStack("TodoApiStack");

// --- Aurora Postgres ---
const aurora = new AuroraPostgresConstruct(apiStack, "AuroraPostgres");

// --- Lambda function for CRUD operations ---
const todosFunction = new nodejs.NodejsFunction(apiStack, "TodosFunction", {
  runtime: lambda.Runtime.NODEJS_20_X,
  entry: path.join(__dirname, "functions", "todos", "handler.ts"),
  handler: "handler",
  environment: {
    CLUSTER_ARN: aurora.cluster.clusterArn,
    SECRET_ARN: aurora.cluster.secret?.secretArn || "",
    DATABASE_NAME: "amplifydb",
  },
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
});

// Grant Lambda permission to use the Data API and read the secret
aurora.cluster.grantDataApiAccess(todosFunction);
aurora.encryptionKey.grantDecrypt(todosFunction);

// --- HTTP API (API Gateway v2) ---
const httpApi = new apigatewayv2.HttpApi(apiStack, "TodoHttpApi", {
  apiName: "TodoApi",
  corsPreflight: {
    allowOrigins: ["*"],
    allowMethods: [
      apigatewayv2.CorsHttpMethod.GET,
      apigatewayv2.CorsHttpMethod.POST,
      apigatewayv2.CorsHttpMethod.PUT,
      apigatewayv2.CorsHttpMethod.DELETE,
      apigatewayv2.CorsHttpMethod.OPTIONS,
    ],
    allowHeaders: ["Content-Type", "Authorization"],
  },
});

const lambdaIntegration = new integrations.HttpLambdaIntegration(
  "TodosIntegration",
  todosFunction
);

httpApi.addRoutes({
  path: "/todos",
  methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
  integration: lambdaIntegration,
});

httpApi.addRoutes({
  path: "/todos/{id}",
  methods: [
    apigatewayv2.HttpMethod.GET,
    apigatewayv2.HttpMethod.PUT,
    apigatewayv2.HttpMethod.DELETE,
  ],
  integration: lambdaIntegration,
});

// Output the API URL
new cdk.CfnOutput(apiStack, "TodoApiUrl", {
  value: httpApi.apiEndpoint,
  description: "Todo REST API endpoint",
});

// Add the API URL to Amplify outputs so the frontend can discover it
backend.addOutput({
  custom: {
    todoApiUrl: httpApi.apiEndpoint,
  },
});
