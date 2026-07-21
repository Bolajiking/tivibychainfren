import type { CreatorProfilePayload } from "@/lib/types";

/**
 * RPDM — revenue per delivered minute. The framework's headline creator metric
 * (F6): it answers "is the time I put on air paying?" in one number, which
 * follower counts never do.
 *
 * IMPORTANT — delivered minutes is currently an **estimate**. We have no
 * watch-time telemetry yet, so minutes are derived from the catalogue:
 *   VOD:  duration × views (an upper bound — it assumes full completion)
 *   Live: elapsed airtime × concurrent viewers is not retained, so live
 *         minutes are excluded rather than guessed.
 * Because the denominator is an over-estimate, the RPDM shown is a *floor*.
 * Every surface that renders it must label it as an estimate. The real fix is
 * per-session watch-time events; when those land, only this module changes.
 */

export interface Rpdm {
  /** Revenue in USD across tips, orders and unlocks. */
  revenueUsd: number;
  /** Estimated minutes of content actually delivered to fans. */
  deliveredMinutes: number;
  /** revenueUsd / deliveredMinutes, or null when nothing has been delivered. */
  perMinute: number | null;
}

export function computeRpdm(payload: CreatorProfilePayload | null): Rpdm {
  const notifications = payload?.notifications ?? [];
  const orders = payload?.orders ?? [];
  const videos = payload?.videos ?? [];

  const revenueUsd =
    notifications.reduce((total, n) => total + (n.amount ?? 0), 0) +
    orders.filter((order) => order.status === "completed").reduce((total, order) => total + order.amount, 0);

  const deliveredSeconds = videos.reduce((total, video) => total + video.durationSec * video.views, 0);
  const deliveredMinutes = Math.round(deliveredSeconds / 60);

  return {
    revenueUsd,
    deliveredMinutes,
    perMinute: deliveredMinutes > 0 ? revenueUsd / deliveredMinutes : null,
  };
}

/** Revenue split by source — rendered in beam steps, never in earn-green bars. */
export function revenueMix(payload: CreatorProfilePayload | null) {
  const notifications = payload?.notifications ?? [];
  const orders = payload?.orders ?? [];

  const tips = notifications.filter((n) => n.type === "donation").reduce((total, n) => total + (n.amount ?? 0), 0);
  const store = orders.filter((order) => order.status === "completed").reduce((total, order) => total + order.amount, 0);
  const unlocks = notifications
    .filter((n) => n.type === "subscription" || n.type === "payment")
    .reduce((total, n) => total + (n.amount ?? 0), 0);

  const total = tips + store + unlocks;
  return {
    total,
    rows: [
      { label: "Tips", value: tips },
      { label: "Store", value: store },
      { label: "Unlocks", value: unlocks },
    ].map((row) => ({ ...row, share: total > 0 ? row.value / total : 0 })),
  };
}
