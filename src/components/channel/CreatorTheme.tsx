import { creatorThemeVars, variantSurfaces, type ThemeVariant } from "@/lib/creator-theme";

/**
 * Tier-1 scope boundary. Everything rendered inside gets the creator's accent
 * and surface steps; everything outside (sheets, checkout, wallet, platform
 * chrome) stays in system tokens. Money surfaces are portalled out of this
 * subtree by design — trust surfaces don't theme.
 */
export function CreatorTheme({
  accent,
  variant,
  className,
  children,
}: {
  accent?: string | null;
  variant?: ThemeVariant | null;
  className?: string;
  children: React.ReactNode;
}) {
  const surfaces = variantSurfaces(variant ?? undefined);
  return (
    <div
      data-creator-theme={variant ?? "midnight"}
      className={className}
      style={{ ...creatorThemeVars(accent, variant), background: surfaces.canvas }}
    >
      {children}
    </div>
  );
}
