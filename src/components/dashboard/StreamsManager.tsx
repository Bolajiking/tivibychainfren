"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Radio, Film, Tv, Settings2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Media";
import { GateBadge, LivePill } from "@/components/ui/Badges";
import { DashboardShell, DashboardEmpty, Panel, useCreatorProfile, fallbackStream, PageSkeleton } from "@/components/dashboard/DashboardScaffold";
import { updateCreatorStream } from "@/lib/creator-client";
import { useSession } from "@/lib/store/session";
import { formatCount } from "@/lib/cn";
import type { Stream, ViewMode } from "@/lib/types";

const MODES: { id: ViewMode; label: string; sub: string }[] = [
  { id: "free", label: "Free", sub: "Anyone can watch" },
  { id: "one-time", label: "Pay-per-view", sub: "One-time unlock" },
  { id: "monthly", label: "Subscribers", sub: "Monthly members" },
];

export function StreamsManager() {
  const user = useSession((s) => s.user);
  const { creator, payload, loading } = useCreatorProfile();
  const stream = payload?.stream ?? fallbackStream(creator);
  const recordings = payload?.videos ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [amount, setAmount] = useState("0");
  const [record, setRecord] = useState(true);
  const [presets, setPresets] = useState("3, 5, 10, 25");
  const [saving, setSaving] = useState(false);

  // Hydrate the form once the stream resolves.
  useEffect(() => {
    if (!stream) return;
    setTitle(stream.title ?? "");
    setDescription(stream.description ?? "");
    setViewMode(stream.viewMode);
    setAmount(String(stream.amount ?? 0));
    setRecord(stream.record);
    setPresets((stream.donationPresets ?? [3, 5, 10, 25]).join(", "));
  }, [stream?.playbackId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <DashboardShell title="Streams" active="streams" creator={creator}><PageSkeleton /></DashboardShell>;
  if (!user || !creator || !stream) {
    return (
      <DashboardShell title="Streams" active="streams" creator={creator}>
        <DashboardEmpty icon={<Tv className="size-5" />} title="Set up your channel first" body="Your stream settings live on your TVinBio channel, so profile setup comes first." />
      </DashboardShell>
    );
  }

  async function save() {
    if (!user || !stream) return;
    setSaving(true);
    try {
      const donationPresets = presets
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      await updateCreatorStream(
        {
          playbackId: stream.playbackId,
          title: title.trim() || stream.title,
          description: description.trim(),
          viewMode,
          amount: viewMode === "free" ? 0 : amount,
          donationPresets: donationPresets.length ? donationPresets : stream.donationPresets,
          record,
          currentStream: stream,
        },
        user.walletAddress,
      );
      toast.success("Stream settings saved");
    } catch {
      toast.error("Couldn't save stream settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell
      title="Streams"
      active="streams"
      creator={creator}
      actions={<Button asChild size="pill" variant="golive"><Link href="/dashboard/broadcast"><Radio className="size-4" /> Go live</Link></Button>}
    >
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Streams</h1>
        <p className="text-[12.5px] text-muted">Set up how you go live, then start broadcasting from the studio.</p>
      </div>

      {/* status */}
      <Panel className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Tile seed={stream.thumbColor} size={52} radius={14} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{stream.title}</span>
                {stream.isActive ? <LivePill small /> : <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[9.5px] font-semibold text-muted">OFFLINE</span>}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <GateBadge viewMode={stream.viewMode} amount={stream.amount} />
                <span className="text-[10.5px] text-faint">{stream.isActive ? `${formatCount(stream.viewerCount)} watching now` : "Ready to go live"}</span>
              </div>
            </div>
          </div>
          <Button asChild variant="secondary" size="pill"><Link href="/dashboard/broadcast"><Settings2 className="size-4" /> Open studio</Link></Button>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* settings */}
        <Panel title="Stream setup">
          <div className="flex flex-col gap-3.5">
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="What's the stream about?" />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${INPUT} resize-none`} placeholder="Tell viewers what to expect" />
            </Field>
            <Field label="Access">
              <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setViewMode(m.id)}
                    className={`rounded-[12px] border px-2 py-2.5 text-left transition ${viewMode === m.id ? "border-blue bg-blue/[0.12]" : "border-white/10 bg-white/[0.03] hover:border-white/20"}`}
                  >
                    <div className="text-[12px] font-semibold text-white">{m.label}</div>
                    <div className="mt-0.5 text-[9.5px] text-faint">{m.sub}</div>
                  </button>
                ))}
              </div>
            </Field>
            {viewMode !== "free" && (
              <Field label={viewMode === "monthly" ? "Monthly price (USDC)" : "Unlock price (USDC)"}>
                <div className="flex items-center gap-2 rounded-[12px] border border-white/12 bg-white/[0.05] px-3">
                  <span className="text-muted">$</span>
                  <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="h-[44px] flex-1 bg-transparent text-[14px] text-white focus:outline-none" placeholder="0" />
                </div>
              </Field>
            )}
            <Field label="Tip presets (USDC)">
              <input value={presets} onChange={(e) => setPresets(e.target.value)} className={INPUT} placeholder="3, 5, 10, 25" />
            </Field>
            <label className="flex items-center justify-between rounded-[12px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <div>
                <div className="text-[12.5px] font-semibold">Record this stream</div>
                <div className="text-[10.5px] text-faint">Save a replay to your videos when you end the stream</div>
              </div>
              <button
                onClick={() => setRecord((r) => !r)}
                className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition ${record ? "bg-blue" : "bg-white/15"}`}
                aria-pressed={record}
              >
                <span className={`absolute top-[3px] size-[20px] rounded-full bg-white transition-all ${record ? "left-[23px]" : "left-[3px]"}`} />
              </button>
            </label>
            <Button onClick={save} disabled={saving} className="mt-1 w-full">
              {saving ? <Loader2 className="size-[18px] animate-spin" /> : "Save settings"}
            </Button>
          </div>
        </Panel>

        {/* recordings */}
        <Panel title="Past recordings" action={<Link href="/dashboard/videos" className="text-[11px] font-semibold text-blue">Manage</Link>}>
          {recordings.length ? (
            <div className="flex flex-col gap-3">
              {recordings.slice(0, 6).map((v) => (
                <Link key={v.playbackId} href="/dashboard/videos" className="flex items-center gap-3">
                  <div className="h-10 w-[62px] shrink-0 rounded-lg" style={{ background: `radial-gradient(80% 80% at 50% 40%,${v.thumbColor},#0a0a0c)` }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold">{v.title}</div>
                    <div className="mt-0.5 text-[10px] text-faint">{formatCount(v.views)} views · {Math.round(v.durationSec / 60)} min</div>
                  </div>
                  <GateBadge viewMode={v.viewMode} amount={v.amount} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <Film className="size-6 text-ghost" />
              <div className="text-[12.5px] font-semibold text-ink-dim">No recordings yet</div>
              <div className="text-[10.5px] text-faint">Record a stream and the replay shows up here.</div>
            </div>
          )}
        </Panel>
      </div>
    </DashboardShell>
  );
}

const INPUT = "h-[44px] w-full rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5 text-[13.5px] text-white placeholder:text-faint focus:border-blue/60 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</div>
      {children}
    </div>
  );
}
