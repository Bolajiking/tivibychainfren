import type { AuthReason, AuthRole } from "./redirect";

/**
 * Contextual auth copy. The sign-up wall should speak to the exact thing the
 * fan just reached for — "To follow Ada, set up an account" beats a generic
 * "Welcome". The least-friction options (email / Apple / Google, no wallet)
 * are the same everywhere; only the framing changes.
 */
export function authPromptCopy(
  role: AuthRole,
  reason?: AuthReason | null,
  subject?: string | null,
): { title: string; body: string } {
  const name = subject?.trim() || null;
  const first = name?.split(/\s+/)[0] ?? null;

  if (reason) {
    switch (reason) {
      case "follow":
        return {
          title: name ? `Follow ${name}` : "Follow this creator",
          body: `Set up a free account to follow${first ? ` ${first}` : ""} — you'll never miss a live. Email or social, no wallet needed.`,
        };
      case "tip":
        return {
          title: name ? `Tip ${first ?? name}` : "Send a tip",
          body: "Set up an account to send a tip. It takes seconds — no wallet required to start.",
        };
      case "buy":
        return {
          title: "Complete your purchase",
          body: "Set up an account to check out securely. No wallet needed to begin.",
        };
      case "unlock":
        return {
          title: "Unlock to watch",
          body: `Create an account to unlock${first ? ` ${first}'s` : " this"} stream and watch. Takes seconds.`,
        };
      case "comment":
        return {
          title: "Join the conversation",
          body: `Set up an account to comment${name ? ` on ${name}` : ""}.`,
        };
      case "save":
        return {
          title: name ? `Save ${name}` : "Save this channel",
          body: "Create an account to keep this channel one tap away, even offline.",
        };
      case "wallet":
        return {
          title: "Open your balance",
          body: "Sign in to view and manage your USDC balance.",
        };
      case "golive":
      case "claim":
        return creatorCopy();
    }
  }

  return role === "creator" ? creatorCopy() : viewerCopy();
}

function creatorCopy() {
  return {
    title: "Claim your TVinBio channel",
    body: "Sign in to set up your channel, stream, store, and share-ready link in one flow.",
  };
}

function viewerCopy() {
  return {
    title: "Welcome to TVinBio",
    body: "Sign in to follow, tip, shop, and join the channels you love. It only takes a few seconds.",
  };
}
