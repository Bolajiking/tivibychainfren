const PROFILE_FLIP_MAX_MS = 3_000;

export function buildTemporaryWebhookInput({ name, url, sharedSecret, streamId }) {
  return {
    name: required(name, "webhook name"),
    url: required(url, "webhook URL"),
    sharedSecret: required(sharedSecret, "webhook shared secret"),
    streamId: required(streamId, "stream id"),
    events: ["stream.started", "stream.idle"],
  };
}

export function webhookPropagationPassed(evidence) {
  const cleanup = evidence?.cleanup ?? {};
  return evidence?.livepeerActive === true
    && evidence?.livepeerIdle === true
    && evidence?.startedWebhookSuccess === true
    && evidence?.idleWebhookSuccess === true
    && evidence?.databaseLive === true
    && evidence?.databaseIdle === true
    && Number.isFinite(evidence?.profileLiveMs)
    && evidence.profileLiveMs <= PROFILE_FLIP_MAX_MS
    && Number.isFinite(evidence?.profileIdleMs)
    && evidence.profileIdleMs <= PROFILE_FLIP_MAX_MS
    && Number(evidence?.pollingRequestsAborted) > 0
    && Number(evidence?.realtimeSockets) > 0
    && Array.isArray(evidence?.consoleErrors)
    && evidence.consoleErrors.length === 0
    && Array.isArray(evidence?.pageErrors)
    && evidence.pageErrors.length === 0
    && cleanup.encoderStopped === true
    && cleanup.webhookDeleted === true
    && cleanup.rowsDeleted === true
    && cleanup.streamDeleted === true
    && cleanup.tunnelStopped === true
    && cleanup.serverStopped === true;
}

export function classifyWebhookConsoleMessage(value) {
  return String(value).includes("ERR_BLOCKED_BY_CLIENT") ? "expected_poll_block" : "unexpected";
}

export function redactWebhookDiagnostic(value, sharedSecret) {
  let output = String(value);
  if (sharedSecret) output = output.split(sharedSecret).join("[redacted]");
  return output.replace(/Livepeer-Signature=[^\s]+/gi, "Livepeer-Signature=[redacted]");
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} missing`);
  return value.trim();
}
