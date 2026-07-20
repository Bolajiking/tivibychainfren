"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ChevronLeft, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Media";
import { useSession } from "@/lib/store/session";
import { getMyCreatorProfile, provisionCreatorProfile, uploadChannelArt } from "@/lib/profile-client";
import { MOCK_MODE } from "@/lib/config";
import type { Creator } from "@/lib/types";

const SWATCHES = ["#24313f", "#2a2a2a", "#3a2b45", "#1f3a33", "#442f2c", "#273247"];

/**
 * Channel profile management. Loads the signed-in creator's profile and saves
 * edits back through the same owner-scoped `/api/profile` upsert used at
 * onboarding. The username (bio link) is fixed here to avoid breaking the link.
 */
export function ProfileSettings() {
  const { user, creator: sessionCreator, setCreator } = useSession();
  const [creator, setLocalCreator] = useState<Creator | null>(sessionCreator);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState(SWATCHES[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [socialLinks, setSocialLinks] = useState<{ kind: string; url: string }[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      if (MOCK_MODE && sessionCreator) {
        applyCreator(sessionCreator);
        setLoading(false);
        return;
      }
      try {
        const payload = await getMyCreatorProfile(user.walletAddress);
        if (!alive) return;
        if (payload?.creator) {
          applyCreator(payload.creator);
          setCreator(payload.creator);
        }
      } catch {
        if (alive) toast.error("Could not load your profile");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.walletAddress]);

  function applyCreator(c: Creator) {
    setLocalCreator(c);
    setDisplayName(c.displayName);
    setCategory(c.category ?? "");
    setBio(c.bio ?? "");
    setAvatarColor(c.avatarColor ?? SWATCHES[0]);
    setAvatarUrl(c.avatarUrl ?? null);
    setSocialLinks(c.socialLinks ?? []);
  }

  async function onPickArt(file: File | null) {
    if (!file || !user) return;
    setAvatarUrl(URL.createObjectURL(file)); // instant local preview
    if (MOCK_MODE) return;
    setUploading(true);
    try {
      const url = await uploadChannelArt(file, user.walletAddress);
      if (url) {
        setAvatarUrl(url);
        const cur = useSession.getState().creator ?? creator;
        if (cur) setCreator({ ...cur, avatarUrl: url });
      }
      toast.success("Channel art updated");
    } catch {
      toast.error("Couldn't upload art");
    } finally {
      setUploading(false);
    }
  }

  function setLink(i: number, patch: Partial<{ kind: string; url: string }>) {
    setSocialLinks((list) => list.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (!user || !creator) return;
    if (!displayName.trim()) return toast.error("Add a channel name");
    setSaving(true);
    try {
      const payload = await provisionCreatorProfile(
        {
          displayName,
          username: creator.username, // fixed — preserves the bio link
          bio,
          category,
          avatarColor,
          avatarUrl, // preserve the uploaded art through the upsert
          socialLinks: socialLinks.filter((l) => l.url.trim()),
        },
        user.walletAddress,
      );
      applyCreator(payload.creator);
      setCreator(payload.creator);
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error && error.message === "username_taken" ? "That link is taken" : "Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-[50px] items-center justify-between border-b border-white/[0.06] px-5">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-[14px] font-semibold text-muted">Channel settings</span>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-white">
          <ChevronLeft className="size-4" /> Dashboard
        </Link>
      </header>

      {!user || (!creator && !loading) ? (
        <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
          <div className="max-w-[380px]">
            <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">No channel yet</h1>
            <p className="mt-2 text-[13px] text-muted">Claim your channel to manage its profile.</p>
            <Button asChild size="lg" className="mt-5"><Link href="/onboarding">Claim channel</Link></Button>
          </div>
        </div>
      ) : loading ? (
        <div className="mx-auto max-w-[520px] px-4 py-8">
          <div className="h-64 animate-pulse rounded-2xl bg-white/[0.06]" />
        </div>
      ) : (
        <div className="mx-auto max-w-[520px] px-4 py-7">
          <div className="mb-5 flex items-center gap-3">
            <label className="relative cursor-pointer" aria-label="Upload channel art">
              <Avatar seed={avatarColor} src={avatarUrl} size={56} ring="#40ACFF" />
              <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-canvas bg-blue text-white">
                {uploading ? <Loader2 className="size-2.5 animate-spin" /> : <ImagePlus className="size-2.5" />}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onPickArt(e.target.files?.[0] ?? null)} />
            </label>
            <div>
              <div className="text-[15px] font-semibold">{displayName || "Your channel"}</div>
              <div className="text-[11.5px] text-faint">tvin.bio/{creator?.username}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Field label="Channel name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} className="h-full w-full bg-transparent text-[13.5px] font-medium text-white placeholder:text-faint focus:outline-none" />
            </Field>
            <Field label="Category">
              <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={32} placeholder="Gaming, music, fitness…" className="h-full w-full bg-transparent text-[13.5px] font-medium text-white placeholder:text-faint focus:outline-none" />
            </Field>
            <div>
              <div className="mb-2 text-[10.5px] text-faint">Bio</div>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="Tell fans what happens here." className="min-h-[78px] w-full resize-none rounded-[13px] border border-white/12 bg-white/[0.06] px-3.5 py-3 text-[13px] font-medium text-white placeholder:text-faint focus:outline-none" />
            </div>
            <div>
              <div className="mb-2 text-[10.5px] text-faint">Channel color</div>
              <div className="flex gap-2">
                {SWATCHES.map((c) => (
                  <button key={c} onClick={() => setAvatarColor(c)} aria-label={`Color ${c}`} className="flex size-9 items-center justify-center rounded-full border-2" style={{ background: c, borderColor: avatarColor === c ? "#40ACFF" : "transparent" }}>
                    {avatarColor === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] text-faint">Social links</span>
                {socialLinks.length < 5 && (
                  <button onClick={() => setSocialLinks((l) => [...l, { kind: "link", url: "" }])} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue hover:text-blue-light">
                    <Plus className="size-3.5" /> Add
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {socialLinks.length === 0 && <div className="rounded-[12px] border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-faint">Add Instagram, X, your shop — anything fans should reach.</div>}
                {socialLinks.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={l.kind} onChange={(e) => setLink(i, { kind: e.target.value })} placeholder="kind" className="h-10 w-[88px] rounded-[12px] border border-white/12 bg-white/[0.06] px-3 text-[12px] text-white placeholder:text-faint focus:border-blue focus:outline-none" />
                    <input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://…" inputMode="url" className="h-10 flex-1 rounded-[12px] border border-white/12 bg-white/[0.06] px-3 text-[12px] text-white placeholder:text-faint focus:border-blue focus:outline-none" />
                    <button onClick={() => setSocialLinks((list) => list.filter((_, idx) => idx !== i))} aria-label="Remove link" className="shrink-0 text-ghost hover:text-red-300"><X className="size-4" /></button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-faint">Links must start with https://</p>
            </div>

            <Button size="lg" className="mt-2" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save profile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10.5px] text-faint">{label}</div>
      <div className="h-[46px] rounded-[13px] border border-white/12 bg-white/[0.06] px-3.5">{children}</div>
    </div>
  );
}
