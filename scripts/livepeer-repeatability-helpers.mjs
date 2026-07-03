const DEFAULT_MODE = "rtmp";
const DEFAULT_COUNT = 20;

const MODE_PLANS = {
  "browser-whip": {
    label: "Browser WHIP Livepeer session repeatability",
    commands: [
      "node scripts/livepeer-e2e.mjs create",
      "node scripts/whip-browser-test.mjs <whip-url> <stream-id>",
      "node scripts/livepeer-e2e.mjs confirm <stream-id> <playback-id>",
      "node scripts/livepeer-e2e.mjs delete-stream <stream-id>",
    ],
  },
  "bridge-whip": {
    label: "Authenticated WHIP-to-RTMP bridge repeatability",
    commands: [
      "node scripts/livepeer-bridge-local-test.mjs",
    ],
  },
  rtmp: {
    label: "RTMP Livepeer session repeatability",
    commands: [
      "node scripts/livepeer-rtmp-e2e-test.mjs",
    ],
  },
  vod: {
    label: "VOD Livepeer asset repeatability",
    commands: [
      "node scripts/livepeer-vod-e2e-test.mjs <small-mp4-file>",
    ],
  },
  "obs-fallback": {
    label: "Restricted-network OBS fallback repeatability",
    commands: [
      "open /dashboard/broadcast with camera/mic permission granted",
      "start browser live on restricted network",
      "confirm OBS fallback is visible and actionable within 20s",
      "stop or reset the pending browser attempt",
    ],
  },
};

export function buildRepeatabilityPlan({ mode = DEFAULT_MODE, count = DEFAULT_COUNT } = {}) {
  const parsedMode = String(mode || DEFAULT_MODE).trim();
  const plan = MODE_PLANS[parsedMode];
  if (!plan) {
    throw new Error(`unsupported mode "${parsedMode}". Expected one of: ${Object.keys(MODE_PLANS).join(", ")}`);
  }

  return {
    mode: parsedMode,
    count: parsePositiveInteger(count, "count"),
    label: plan.label,
    commands: [...plan.commands],
  };
}

export function summarizeRepeatabilityRuns(runs) {
  const normalizedRuns = Array.isArray(runs) ? runs : [];
  let consecutivePasses = 0;
  let passed = 0;

  for (const run of normalizedRuns) {
    if (run?.ok) {
      passed += 1;
      consecutivePasses += 1;
    } else {
      consecutivePasses = 0;
    }
  }

  const total = normalizedRuns.length;
  const failed = total - passed;

  return {
    total,
    passed,
    failed,
    consecutivePasses,
    ok: total > 0 && failed === 0,
    runs: normalizedRuns.map((run, index) => ({
      index: index + 1,
      ok: Boolean(run?.ok),
      label: run?.label || `run ${index + 1}`,
      durationMs: Number.isFinite(run?.durationMs) ? Math.max(0, Math.round(run.durationMs)) : null,
      error: run?.error ? String(run.error) : null,
    })),
  };
}

export function formatRepeatabilityReport(label, summary) {
  return `${label}: ${summary.passed}/${summary.total} passed, ${summary.consecutivePasses} consecutive, ${summary.failed} failed.`;
}

export function parseRepeatabilityArgs(argv) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const options = {
    mode: DEFAULT_MODE,
    count: DEFAULT_COUNT,
    command: null,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--mode") {
      options.mode = requireValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
    } else if (arg === "--count") {
      options.count = requireValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--count=")) {
      options.count = arg.slice("--count=".length);
    } else if (arg === "--command") {
      options.command = requireValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--command=")) {
      options.command = arg.slice("--command=".length);
    } else {
      throw new Error(`unknown argument "${arg}"`);
    }
  }

  return {
    ...buildRepeatabilityPlan({ mode: options.mode, count: options.count }),
    command: options.command,
    dryRun: options.dryRun,
  };
}

function parsePositiveInteger(value, label) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Number(text);
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
