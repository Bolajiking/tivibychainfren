import assert from "node:assert/strict";
import { test } from "node:test";

let helpers = {};
try {
  helpers = await import("../scripts/dashboard-obs-fallback-helpers.mjs");
} catch {}

test("dashboard fallback harness supports Chromium, Firefox, and WebKit media profiles", () => {
  assert.equal(typeof helpers.browserLaunchProfile, "function");
  assert.deepEqual(helpers.browserLaunchProfile("chromium").args, [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ]);
  assert.equal(helpers.browserLaunchProfile("firefox").firefoxUserPrefs["media.navigator.streams.fake"], true);
  assert.equal(helpers.browserLaunchProfile("firefox").grantMediaPermissions, false);
  assert.equal(helpers.browserLaunchProfile("chromium").grantMediaPermissions, true);
  assert.deepEqual(helpers.browserLaunchProfile("webkit"), {
    grantMediaPermissions: false,
    syntheticMedia: true,
  });
  assert.throws(() => helpers.browserLaunchProfile("edge"), /Unsupported browser/);
});

test("dashboard fallback harness exposes a headed physical-media Chromium profile", () => {
  assert.deepEqual(helpers.browserLaunchProfile("chromium", { realMedia: true }), {
    headless: false,
    grantMediaPermissions: true,
  });
  assert.throws(
    () => helpers.browserLaunchProfile("webkit", { realMedia: true }),
    /Real media is not supported/,
  );
});

test("dashboard fallback harness exposes a headed physical-media Firefox profile", () => {
  assert.deepEqual(helpers.browserLaunchProfile("firefox", { realMedia: true }), {
    headless: false,
    firefoxUserPrefs: {
      "media.navigator.permission.disabled": true,
    },
    grantMediaPermissions: false,
  });
});

test("dashboard fallback harness has stable desktop and mobile context profiles", () => {
  assert.equal(typeof helpers.browserContextProfile, "function");
  assert.deepEqual(helpers.browserContextProfile("desktop"), {
    viewport: { width: 1440, height: 900 },
  });
  assert.deepEqual(helpers.browserContextProfile("mobile"), {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  assert.throws(() => helpers.browserContextProfile("tablet"), /Unsupported viewport/);
});

test("dashboard fallback harness validates supported failure scenarios", () => {
  assert.equal(typeof helpers.harnessScenario, "function");
  assert.equal(helpers.harnessScenario("fallback"), "fallback");
  assert.equal(helpers.harnessScenario("permission-denied"), "permission-denied");
  assert.equal(helpers.harnessScenario("track-interruption"), "track-interruption");
  assert.throws(() => helpers.harnessScenario("silent-dark"), /Unsupported scenario/);
});

test("ready-room evidence requires camera, mic, muted autoplay, and inline playback", () => {
  assert.equal(typeof helpers.readyRoomPreflightPassed, "function");
  assert.equal(
    helpers.readyRoomPreflightPassed({
      readyState: 4,
      audioTracks: 1,
      videoTracks: 1,
      muted: true,
      autoplay: true,
      playsInline: true,
    }),
    true,
  );
  assert.equal(
    helpers.readyRoomPreflightPassed({
      readyState: 4,
      audioTracks: 1,
      videoTracks: 1,
      muted: true,
      autoplay: true,
      playsInline: false,
    }),
    false,
  );
});
