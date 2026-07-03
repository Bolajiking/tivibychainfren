import { parseLivepeerStreamSessions, type LivepeerSessionLoader } from "@/lib/livepeer/session-client";
import type { LiveFieldEvidence } from "@/lib/livepeer/field";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export function describeLiveFieldBrowser(userAgent: string): {
  browser: "chrome" | "edge" | "firefox" | "safari" | "unknown";
  platform: "android" | "ios" | "linux" | "macos" | "windows" | "unknown";
  mobile: boolean;
} {
  const browser = /EdgA|EdgiOS|Edg\//i.test(userAgent)
    ? "edge"
    : /CriOS|Chrome\//i.test(userAgent)
      ? "chrome"
      : /FxiOS|Firefox\//i.test(userAgent)
        ? "firefox"
        : /Safari\//i.test(userAgent) && /Version\//i.test(userAgent)
          ? "safari"
          : "unknown";
  const platform = /iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent)
    ? "ios"
    : /Android/i.test(userAgent)
      ? "android"
      : /Windows/i.test(userAgent)
        ? "windows"
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? "macos"
          : /Linux/i.test(userAgent)
            ? "linux"
            : "unknown";
  return { browser, platform, mobile: platform === "ios" || platform === "android" || /Mobile/i.test(userAgent) };
}

export function describeLiveFieldMedia(
  tracks: Array<{ kind?: string | null; readyState?: string | null; enabled?: boolean | null }>,
): { camera: string; microphone: string } {
  return {
    camera: describeTrack(tracks.find((track) => track.kind === "video")),
    microphone: describeTrack(tracks.find((track) => track.kind === "audio")),
  };
}

export function createLiveFieldSessionLoader(token: string, fetcher: Fetcher = fetch): LivepeerSessionLoader {
  return async (livepeerId) => {
    const params = new URLSearchParams({ token, parentId: livepeerId });
    const response = await fetcher(`/api/field/livepeer/session?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("field_session_unavailable");
    return parseLivepeerStreamSessions(await response.json());
  };
}

export async function reportLiveFieldEvidence(
  token: string,
  streamId: string,
  evidence: LiveFieldEvidence,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const params = new URLSearchParams({ token });
  const response = await fetcher(`/api/field/livepeer/evidence?${params.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamId, ...evidence }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("field_evidence_unavailable");
}

function describeTrack(track: { readyState?: string | null; enabled?: boolean | null } | undefined): string {
  if (!track) return "missing";
  if (track.readyState && track.readyState !== "live") return track.readyState.slice(0, 40);
  return track.enabled === false ? "disabled" : "live";
}
