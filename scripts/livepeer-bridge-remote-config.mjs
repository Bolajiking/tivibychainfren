import { closeSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  remoteBridgeConfigInputs,
  remoteBridgeValidationConfig,
} from "./livepeer-bridge-helpers.mjs";

const outputArgument = process.argv[2];
if (!outputArgument || process.argv.length !== 3) {
  throw new Error("Usage: node scripts/livepeer-bridge-remote-config.mjs <output.yml>");
}

const inputs = remoteBridgeConfigInputs(process.env);
const config = remoteBridgeValidationConfig(inputs);
const outputPath = resolve(outputArgument);
let descriptor;

try {
  descriptor = openSync(outputPath, "wx", 0o600);
} catch (error) {
  if (error?.code === "EEXIST") throw new Error(`Output already exists: ${outputPath}`);
  throw error;
}

try {
  writeFileSync(descriptor, config, "utf8");
} catch (error) {
  closeSync(descriptor);
  descriptor = undefined;
  unlinkSync(outputPath);
  throw error;
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
}

console.log(JSON.stringify({
  outputPath,
  publicHost: inputs.publicHost,
  allowedOrigin: inputs.allowedOrigin,
  fileMode: "0600",
  signalingPort: 8443,
  iceTcpPort: 443,
}));
