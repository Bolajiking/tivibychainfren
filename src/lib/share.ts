import { toast } from "sonner";

/**
 * Share-back helper (framework §11.2): on mobile the native share sheet opens
 * straight into WhatsApp / IG / X — the funnel runs both directions. Falls
 * back to clipboard on desktop or when the share sheet is unavailable.
 */
export async function shareLink({ url, text }: { url: string; text?: string }) {
  const payload = { url, text, title: text };
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch (error) {
      // User cancelled the sheet — not an error, nothing to fall back to.
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
    return true;
  } catch {
    toast.error("Couldn't share the link");
    return false;
  }
}
