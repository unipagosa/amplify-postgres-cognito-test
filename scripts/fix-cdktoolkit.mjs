import {
  CloudFormationClient,
  DescribeStacksCommand,
  UpdateStackCommand,
  GetTemplateCommand,
} from "@aws-sdk/client-cloudformation";

const cf = new CloudFormationClient({});

async function waitForStack() {
  while (true) {
    const res = await cf.send(new DescribeStacksCommand({ StackName: "CDKToolkit" }));
    const status = res.Stacks[0].StackStatus;
    const reason = res.Stacks[0].StackStatusReason || "";
    process.stdout.write(`\r  Status: ${status} ${reason}                    `);
    if (status.endsWith("_COMPLETE") || status.endsWith("_FAILED")) {
      console.log();
      return status;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  // Get the current template
  const tmpl = await cf.send(new GetTemplateCommand({ StackName: "CDKToolkit" }));
  let templateBody = tmpl.TemplateBody;

  // Fix the ?Description YAML tag if present
  templateBody = templateBody.replace(/^\?Description:/, "Description:");

  // Verify ScanOnPush is there
  if (!templateBody.includes("ScanOnPush: true")) {
    console.log("Adding ScanOnPush: true to template...");
    templateBody = templateBody.replace(
      /ContainerAssetsRepository:\s*\n\s*Type: AWS::ECR::Repository\s*\n\s*Properties:/,
      `ContainerAssetsRepository:\n    Type: AWS::ECR::Repository\n    Properties:\n      ImageScanningConfiguration:\n        ScanOnPush: true`
    );
  } else {
    console.log("Template already has ScanOnPush: true");
  }

  // Get current parameters
  const stackInfo = await cf.send(new DescribeStacksCommand({ StackName: "CDKToolkit" }));
  const stack = stackInfo.Stacks[0];
  console.log(`Current status: ${stack.StackStatus}`);

  const currentParams = (stack.Parameters || []).map((p) => ({
    ParameterKey: p.ParameterKey,
    UsePreviousValue: true,
  }));

  // Add a tiny metadata change to force an update
  const timestamp = new Date().toISOString();
  if (templateBody.includes("Metadata:")) {
    templateBody = templateBody.replace(
      /Metadata:\s*\n/,
      `Metadata:\n    LastUpdated: "${timestamp}"\n`
    );
  } else {
    // Add metadata to the stack level
    templateBody = templateBody + `\nMetadata:\n  LastUpdated: "${timestamp}"\n`;
  }

  console.log("Updating CDKToolkit stack...");
  try {
    await cf.send(
      new UpdateStackCommand({
        StackName: "CDKToolkit",
        TemplateBody: templateBody,
        Parameters: currentParams,
        Capabilities: ["CAPABILITY_NAMED_IAM"],
      })
    );
    console.log("Update started. Waiting...");
    const finalStatus = await waitForStack();
    if (finalStatus === "UPDATE_COMPLETE") {
      console.log("✓ CDKToolkit fixed!");
    } else {
      console.log("✗ Still failing. The Control Tower hook may need to be set to WARN mode.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
