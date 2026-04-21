import {
  CloudFormationClient,
  GetTemplateCommand,
  UpdateStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { readFileSync } from "fs";

const cf = new CloudFormationClient({});

async function waitForStack(stackName) {
  while (true) {
    const res = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    const status = res.Stacks[0].StackStatus;
    console.log(`  Stack status: ${status}`);
    if (status.endsWith("_COMPLETE") || status.endsWith("_FAILED")) return status;
    await new Promise((r) => setTimeout(r, 10000));
  }
}

async function main() {
  console.log("Reading modified template...");
  const templateBody = readFileSync("cdktoolkit-template.yaml", "utf-8");

  // Get current parameters to preserve them
  console.log("Getting current stack parameters...");
  const stackInfo = await cf.send(new DescribeStacksCommand({ StackName: "CDKToolkit" }));
  const currentParams = (stackInfo.Stacks[0].Parameters || []).map((p) => ({
    ParameterKey: p.ParameterKey,
    UsePreviousValue: true,
  }));

  console.log(`Updating CDKToolkit stack with ${currentParams.length} parameters...`);
  try {
    await cf.send(
      new UpdateStackCommand({
        StackName: "CDKToolkit",
        TemplateBody: templateBody,
        Parameters: currentParams,
        Capabilities: ["CAPABILITY_NAMED_IAM"],
      })
    );
    console.log("Update initiated. Waiting...");
    const finalStatus = await waitForStack("CDKToolkit");
    console.log(`\nFinal status: ${finalStatus}`);
    if (finalStatus === "UPDATE_COMPLETE") {
      console.log("✓ CDKToolkit stack updated successfully!");
    } else {
      console.log("✗ Update failed. Check the CloudFormation console for details.");
    }
  } catch (err) {
    if (err.message?.includes("No updates are to be performed")) {
      console.log("Stack is already up to date.");
    } else {
      console.error("Error:", err.message);
    }
  }
}

main();
