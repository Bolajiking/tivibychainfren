/**
 * Local-currency echo for money surfaces.
 *
 * Fans in the core market reason in naira, not dollars — showing the
 * approximate local amount beside the USD figure removes a mental conversion
 * at exactly the moment trust matters most. Deliberately labelled "≈": this is
 * an indicative rate for comprehension, never the settled amount.
 *
 * The rate is a build-time constant today. When a rates feed lands, only this
 * module changes.
 */

const NGN_PER_USD = 1520;

export function approxLocal(amountUsd: number): string {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return "";
  const ngn = Math.round(amountUsd * NGN_PER_USD);
  return `≈ ₦${ngn.toLocaleString("en-US")}`;
}
