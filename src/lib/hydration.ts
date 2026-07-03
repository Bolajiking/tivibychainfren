export function isHydrationExtensionAttributeName(name: string): boolean {
  return name === "bis_skin_checked" || name === "bis_register" || name.startsWith("__processed_");
}

export const extensionHydrationAttributeCleanupScript = String.raw`
(() => {
  const shouldRemove = (name) =>
    name === "bis_skin_checked" || name === "bis_register" || name.indexOf("__processed_") === 0;

  const clean = (element) => {
    if (!element || element.nodeType !== 1 || !element.attributes) return;
    for (const attribute of Array.from(element.attributes)) {
      if (shouldRemove(attribute.name)) element.removeAttribute(attribute.name);
    }
  };

  const sweep = (root) => {
    clean(root);
    if (root.querySelectorAll) root.querySelectorAll("*").forEach(clean);
  };

  sweep(document.documentElement);

  // Extensions like Bitdefender (bis_skin_checked) re-inject these attributes
  // continuously — including between this initial sweep and React's hydration
  // commit, which is what triggers the mismatch warning. Keep stripping them as
  // they are (re-)added so the DOM React reads stays clean.
  try {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target && shouldRemove(m.attributeName)) {
          clean(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((node) => sweep(node));
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  } catch (_) {
    /* MutationObserver unavailable — initial sweep still applied */
  }
})();
`;
