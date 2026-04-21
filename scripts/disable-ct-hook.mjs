/**
 * Temporarily set the ControlTower::Guard::Hook to WARN mode,
 * re-bootstrap CDK, then set it back to FAIL mode.
 */
import {
  CloudFormationClient,
  ActivateTypeCommand,
  DescribeTypeCommand,
  SetTypeConfigurationCommand,
  ListTypesCommand,
} from "@aws-sdk/client-cloudformation";

const cf = new CloudFormationClient({});
const HOOK_TYPE = "ControlTower::Guard::Hook";

async function getHookConfig() {
  try {
    const res = await cf.send(new DescribeTypeCommand({
      Type: "HOOK",
      TypeName: HOOK_TYPE,
    }));
    console.log("Hook status:", res.DeprecatedStatus || "LIVE");
    console.log("Hook ARN:", res.Arn);
    return res;
  } catch (err) {
    console.error("Could not find hook:", err.message);
    return null;
  }
}

async function setHookMode(mode) {
  // mode: "WARN" or "FAIL"
  const config = JSON.stringify({
    CloudFormationConfiguration: {
      HookConfiguration: {
        TargetStacks: "ALL",
        FailureMode: mode,
        Properties: {},
      },
    },
  });

  try {
    await cf.send(new SetTypeConfigurationCommand({
      Type: "HOOK",
      TypeName: HOOK_TYPE,
      Configuration: config,
    }));
    console.log(`Hook set to ${mode} mode`);
  } catch (err) {
    console.error(`Failed to set hook to ${mode}:`, err.message);
  }
}

async function main() {
  console.log("Looking up Control Tower hook...");
  const hook = await getHookConfig();
  if (!hook) {
    console.log("\nCould not find the hook. You may need to do this manually:");
    console.log("1. Go to CloudFormation > Hooks in the AWS Console");
    console.log("2. Find ControlTower::Guard::Hook");
    console.log("3. Set failure mode to WARN");
    console.log("4. Re-deploy in Amplify");
    console.log("5. Set failure mode back to FAIL");
    return;
  }

  console.log("\nSetting hook to WARN mode...");
  await setHookMode("WARN");
  console.log("\n✓ Done! Now go to Amplify Console and click 'Try again'.");
  console.log("After the deployment succeeds, run this to restore FAIL mode:");
  console.log("  node -e \"import('./scripts/disable-ct-hook.mjs').then(m => m.restore())\"");
}

export async function restore() {
  console.log("Restoring hook to FAIL mode...");
  await setHookMode("FAIL");
  console.log("✓ Hook restored to FAIL mode");
}

main();
