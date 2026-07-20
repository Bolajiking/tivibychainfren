"use client";

import { useEffect } from "react";

/**
 * Runtime favicon swap (Identity Package 1): while the creator is on air the
 * browser tab shows the live mark — the tab itself goes on air. Restores the
 * idle icon on unmount / when the stream ends.
 */
export function LiveFavicon({ live }: { live: boolean }) {
  useEffect(() => {
    if (!live) return;
    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]'),
    );
    const previous = links.map((l) => ({ el: l, href: l.href }));
    const apply = (href: string) => {
      if (links.length === 0) {
        const el = document.createElement("link");
        el.rel = "icon";
        el.href = href;
        document.head.appendChild(el);
        previous.push({ el, href: "" });
        links.push(el);
      } else {
        links.forEach((l) => {
          l.href = href;
        });
      }
    };
    apply("/brand/favicon-32-live.png");
    return () => {
      previous.forEach(({ el, href }) => {
        if (href) el.href = href;
        else el.remove();
      });
    };
  }, [live]);
  return null;
}
