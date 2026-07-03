#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  formatRepeatabilityReport,
  parseRepeatabilityArgs,
  summarizeRepeatabilityRuns,
} from "./livepeer-repeatability-helpers.mjs";

async function main() {
  const options = parseRepeatabilityArgs(process.argv.slice(2));

  printPlan(options);

  if (options.dryRun) {
    return;
  }

  if (!options.command) {
    throw new Error("provide --command to run a repeatability loop, or use --dry-run to print the proof plan");
  }

  const runs = [];
  for (let index = 0; index < options.count; index += 1) {
    const label = `${options.mode} run ${index + 1}/${options.count}`;
    const startedAt = Date.now();
    process.stdout.write(`\n--- ${label} ---\n`);
    const result = await runCommand(options.command);
    runs.push({
      ok: result.exitCode === 0,
      label,
      durationMs: Date.now() - startedAt,
      error: result.exitCode === 0 ? null : `exit ${result.exitCode}`,
    });

    if (result.exitCode !== 0) {
      break;
    }
  }

  const summary = summarizeRepeatabilityRuns(runs);
  process.stdout.write(`\n${formatRepeatabilityReport(options.label, summary)}\n`);
  process.exitCode = summary.ok && summary.total === options.count ? 0 : 2;
}

function printPlan(options) {
  process.stdout.write(`${options.label}\n`);
  process.stdout.write(`Mode: ${options.mode}\n`);
  process.stdout.write(`Target: ${options.count}/${options.count} consecutive green\n`);
  process.stdout.write("Proof steps:\n");
  for (const command of options.commands) {
    process.stdout.write(`- ${command}\n`);
  }
}

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      resolve({ exitCode: 1 });
    });

    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1 });
    });
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
