const CHROMIUM_ARGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

export function browserLaunchProfile(browserName, { realMedia = false } = {}) {
  if (realMedia) {
    if (browserName === "chromium") return { headless: false, grantMediaPermissions: true };
    if (browserName === "firefox") {
      return {
        headless: false,
        firefoxUserPrefs: {
          "media.navigator.permission.disabled": true,
        },
        grantMediaPermissions: false,
      };
    }
    throw new Error(`Real media is not supported for ${browserName} by this harness`);
  }
  if (browserName === "chromium") return { args: CHROMIUM_ARGS, grantMediaPermissions: true };
  if (browserName === "firefox") {
    return {
      firefoxUserPrefs: {
        "media.navigator.permission.disabled": true,
        "media.navigator.streams.fake": true,
      },
      grantMediaPermissions: false,
    };
  }
  if (browserName === "webkit") {
    return {
      grantMediaPermissions: false,
      syntheticMedia: true,
    };
  }
  throw new Error(`Unsupported browser: ${browserName}`);
}

export function browserContextProfile(viewportName) {
  if (viewportName === "desktop") return { viewport: { width: 1440, height: 900 } };
  if (viewportName === "mobile") {
    return {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    };
  }
  throw new Error(`Unsupported viewport: ${viewportName}`);
}

export function harnessScenario(value) {
  if (value === "fallback" || value === "permission-denied" || value === "track-interruption") return value;
  throw new Error(`Unsupported scenario: ${value}`);
}

export function readyRoomPreflightPassed(evidence) {
  return evidence.readyState >= 2
    && evidence.audioTracks > 0
    && evidence.videoTracks > 0
    && evidence.muted === true
    && evidence.autoplay === true
    && evidence.playsInline === true;
}
