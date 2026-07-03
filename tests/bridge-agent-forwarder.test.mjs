import assert from "node:assert/strict";
import { test } from "node:test";

const forwarder = await import("../bridge/agent/forwarder.mjs");

function fakeMediamtx(tracks) {
  return async (apiPath) => {
    assert.match(apiPath, /^\/v3\/paths\/get\//);
    return { tracks };
  };
}

test("ffmpeg args copy H.264 and transcode Opus to AAC into RTMP/FLV (proven boundary)", () => {
  const args = forwarder.ffmpegForwardArgs(
    "rtsp://127.0.0.1:8554/path-1",
    "rtmp://rtmp.livepeer.com/live/key",
  );
  const joined = args.join(" ");
  assert.ok(joined.includes("-rtsp_transport tcp"));
  assert.ok(joined.includes("-i rtsp://127.0.0.1:8554/path-1"));
  assert.ok(joined.includes("-c:v copy"));
  assert.ok(joined.includes("-c:a aac"));
  assert.ok(joined.includes("-f flv"));
  assert.equal(args[args.length - 1], "rtmp://rtmp.livepeer.com/live/key");
});

test("a non-H.264 video track is rejected before any ffmpeg spawn", async () => {
  const plan = await forwarder.resolveForwarderPlan({
    path: "path-1",
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: fakeMediamtx(["VP8", "Opus"]),
    fetchDestination: async () => "rtmp://rtmp.livepeer.com/live/key",
  });
  assert.deepEqual(plan, { action: "reject", reason: "unsupported_codec" });
});

test("H.264 plus a destination yields a forward plan", async () => {
  const plan = await forwarder.resolveForwarderPlan({
    path: "path-1",
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: fakeMediamtx(["H264", "Opus"]),
    fetchDestination: async () => "rtmp://rtmp.livepeer.com/live/key",
  });
  assert.equal(plan.action, "forward");
  assert.equal(plan.args[plan.args.length - 1], "rtmp://rtmp.livepeer.com/live/key");
});

test("a missing destination (lease already gone) is rejected", async () => {
  const plan = await forwarder.resolveForwarderPlan({
    path: "path-1",
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: fakeMediamtx(["H264"]),
    fetchDestination: async () => null,
  });
  assert.deepEqual(plan, { action: "reject", reason: "no_destination" });
});

test("an unreachable MediaMTX API fails closed", async () => {
  const plan = await forwarder.resolveForwarderPlan({
    path: "path-1",
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: async () => {
      throw new Error("down");
    },
    fetchDestination: async () => "rtmp://x/y/z",
  });
  assert.deepEqual(plan, { action: "reject", reason: "path_unavailable" });
});

test("the runner spawns for a forward plan, terminates on stop, and never double-spawns", async () => {
  const spawned = [];
  const killed = [];
  const rejections = [];
  const runner = forwarder.createForwarderRunner({
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: fakeMediamtx(["H264", "Opus"]),
    fetchDestination: async () => "rtmp://rtmp.livepeer.com/live/key",
    spawn: (command, args) => {
      spawned.push({ command, args });
      return {
        kill: (signal) => killed.push(signal),
        on: () => {},
      };
    },
    onReject: (path, reason) => rejections.push({ path, reason }),
  });

  await runner.start("path-1");
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].command, "ffmpeg");

  await runner.start("path-1");
  assert.equal(spawned.length, 1, "second start for the same path is a no-op");

  runner.stop("path-1");
  assert.deepEqual(killed, ["SIGTERM"]);
  runner.stop("path-1");
  assert.deepEqual(killed, ["SIGTERM"], "stop is idempotent");

  assert.deepEqual(rejections, []);
});

test("the runner rejects instead of spawning when the codec contract fails", async () => {
  const spawned = [];
  const rejections = [];
  const runner = forwarder.createForwarderRunner({
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: fakeMediamtx(["VP8", "Opus"]),
    fetchDestination: async () => "rtmp://rtmp.livepeer.com/live/key",
    spawn: () => {
      spawned.push(1);
      return { kill: () => {}, on: () => {} };
    },
    onReject: (path, reason) => rejections.push({ path, reason }),
  });
  await runner.start("path-1");
  assert.deepEqual(spawned, []);
  assert.deepEqual(rejections, [{ path: "path-1", reason: "unsupported_codec" }]);
});

test("stopAll terminates every running forwarder for graceful shutdown", async () => {
  const killed = [];
  const runner = forwarder.createForwarderRunner({
    rtspBase: "rtsp://127.0.0.1:8554",
    fetchPathInfo: fakeMediamtx(["H264"]),
    fetchDestination: async () => "rtmp://rtmp.livepeer.com/live/key",
    spawn: () => ({ kill: (signal) => killed.push(signal), on: () => {} }),
    onReject: () => {},
  });
  await runner.start("path-1");
  await runner.start("path-2");
  runner.stopAll();
  assert.deepEqual(killed, ["SIGTERM", "SIGTERM"]);
});
