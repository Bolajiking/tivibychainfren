"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Play, HandCoins, ChevronRight, ImagePlus } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Confetti } from "@/components/money/PaymentProgress";
import { useSession } from "@/lib/store/session";
import { config } from "@/lib/config";
import { provisionCreatorProfile, redeemInvite, uploadChannelArt, checkCreatorAccess, getMyCreatorProfile } from "@/lib/profile-client";
import { slugifyUsername } from "@/lib/profile";
import { buildAuthHref } from "@/lib/auth/redirect";
import { shareLink } from "@/lib/share";
import { useHydrated } from "@/lib/store/useHydrated";
import { MOCK_MODE } from "@/lib/config";
import { cn } from "@/lib/cn";
import type { Creator } from "@/lib/types";

type Step = "invite" | "create" | "ready" | "firstrun";

export default function Onboarding() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingFlow />
    </Suspense>
  );
}

function OnboardingFlow() {
  const [step, setStep] = useState<Step>("invite");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [granted, setGranted] = useState(false);
  const [created, setCreated] = useState<Creator | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, creator: sessionCreator, setCreator } = useSession();
  const hydrated = useHydrated();
  const entryChecked = useRef(false);

  const username = slugifyUsername(name || user?.displayName || "") || "yourname";
  const profileUsername = created?.username ?? username;

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName === "You" ? "" : user.displayName);
  }, [name, user?.displayName]);

  // Preserve the invite code across the sign-in redirect.
  useEffect(() => {
    const fromUrl = searchParams.get("code");
    if (fromUrl && !code) setCode(fromUrl.toUpperCase());
  }, [searchParams, code]);

  // Entry routing — runs once when the user is known (a ref guards against the
  // re-run that creating a channel this session would otherwise trigger):
  //  • One channel per account: an existing creator is sent to their dashboard,
  //    never offered a second create/claim.
  //  • A wallet that redeemed an invite (but has no channel yet) skips to the
  //    channel-details step; everyone else passes the invite gate first.
  useEffect(() => {
    // Wait for the persisted session to settle first — otherwise a returning
    // creator briefly flashes the invite-code screen before the redirect to
    // their dashboard lands (the persisted `user`/`creator` aren't readable
    // until zustand's persist middleware rehydrates from localStorage).
    if (!hydrated || !user || entryChecked.current) return;
    entryChecked.current = true;
    let alive = true;
    (async () => {
      // Already own a channel? Manage the one you have.
      if (sessionCreator) {
        router.replace("/dashboard");
        return;
      }
      if (MOCK_MODE) {
        if (searchParams.get("start") === "create") setStep("create");
        return;
      }
      const profile = await getMyCreatorProfile(user.walletAddress).catch(() => null);
      if (!alive) return;
      if (profile?.creator) {
        setCreator(profile.creator);
        router.replace("/dashboard");
        return;
      }
      const has = await checkCreatorAccess(user.walletAddress);
      if (!alive) return;
      setGranted(has);
      setStep(has ? "create" : "invite");
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user]);

  // Invite gate: sign in (preserving the code), then redeem before channel setup.
  async function continueToProfile() {
    if (!user) {
      if (config.privy.enabled) {
        toast("Sign in first, then enter your invite code");
        const next = `/onboarding${code ? `?code=${encodeURIComponent(code)}` : ""}`;
        router.push(buildAuthHref({ role: "creator", next }));
        return;
      }
      login("You");
      setStep("create"); // mock mode has no invite gate
      return;
    }
    if (MOCK_MODE || granted) {
      setStep("create");
      return;
    }
    if (!code.trim()) {
      toast.error("Enter your invite code");
      return;
    }
    setSaving(true);
    try {
      await redeemInvite(code, user.walletAddress);
      setGranted(true);
      setStep("create");
    } catch (error) {
      toast.error(profileErrorMessage(error instanceof Error ? error.message : "invalid_code"));
    } finally {
      setSaving(false);
    }
  }

  async function createChannel() {
    if (!user) return continueToProfile();
    if (!name.trim()) {
      toast.error("Add a channel name");
      return;
    }

    setSaving(true);
    try {
      // Invite gate already cleared at the invite step; redeem here only as a
      // fallback (e.g. deep-link straight to create). Idempotent server-side.
      if (!MOCK_MODE && !granted) await redeemInvite(code, user.walletAddress);
      const payload = await provisionCreatorProfile(
        {
          displayName: name,
          username,
          bio,
          category,
        },
        user.walletAddress,
      );
      // Channel art: upload after the creator row exists, then attach the URL.
      let creator = payload.creator;
      if (artFile && !MOCK_MODE) {
        try {
          const avatarUrl = await uploadChannelArt(artFile, user.walletAddress);
          if (avatarUrl) creator = { ...creator, avatarUrl };
        } catch {
          toast("Channel created — add your art in settings");
        }
      }
      setCreated(creator);
      setCreator(creator);
      setStep("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "profile_request_failed";
      toast.error(profileErrorMessage(message));
    } finally {
      setSaving(false);
    }
  }

  // Never show the invite/create UI before we know whether this is a
  // returning creator — the persisted session (and thus `user`/`sessionCreator`)
  // isn't readable until this resolves.
  if (!hydrated) return <OnboardingFallback />;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
        style={{ background: "radial-gradient(95% 100% at 30% 0%,rgba(64,172,255,.16),transparent 60%)" }} />

      <div className="relative w-full max-w-[420px]">
        {step === "invite" && (
          <div className="animate-[tvRise_.3s_ease]">
            <Logo size={44} href="" />
            <div className="mt-5 inline-flex rounded-full border border-blue-light/45 bg-blue/[0.08] px-3 py-1.5 text-[9px] font-bold tracking-[0.14em] text-blue-light">INVITE ONLY</div>
            <h1 className="font-display mt-4 text-[30px] font-semibold leading-[1.05] tracking-[-0.02em]">Claim your channel.</h1>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">Enter your invite code to start building the platform the algorithm wouldn&apos;t let you.</p>
            <p className="outcome mt-2 text-[13px] text-muted">a link you own, not one you rent</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ADA·2K"
              className="mt-5 h-[52px] w-full rounded-[14px] border-[1.5px] border-blue bg-white/[0.06] text-center text-base font-semibold tracking-[0.28em] text-white shadow-[0_0_0_3px_rgba(64,172,255,.12)] placeholder:text-faint focus:outline-none"
            />
            <Button size="lg" className="mt-3 w-full" onClick={continueToProfile} disabled={saving}>
              {saving ? "Checking…" : "Continue"}
            </Button>
            <div className="mt-3.5 text-center text-[11px] text-faint">No code? <span className="font-semibold text-blue-light">Join the waitlist</span></div>
          </div>
        )}

        {step === "create" && (
          <div className="animate-[tvRise_.3s_ease]">
            <Progress n={2} of={3} />
            <h1 className="font-display mt-5 text-[21px] font-semibold tracking-[-0.01em]">Name your channel</h1>
            <div className="my-6 flex flex-col items-center">
              <label className="group relative flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-white/20 bg-white/[0.06] text-faint hover:border-blue/60">
                {artPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artPreview} alt="Channel art preview" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setArtFile(f);
                    setArtPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
              </label>
              <div className="mt-2.5 text-[10.5px] text-faint">{artFile ? "Change channel art" : "Add channel art"}</div>
            </div>
            <Field label="Channel name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Plays" className="h-full w-full bg-transparent text-[13.5px] font-medium text-white placeholder:text-faint focus:outline-none" />
            </Field>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <Field label="Category">
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Gaming, music, fitness…" className="h-full w-full bg-transparent text-[13.5px] font-medium text-white placeholder:text-faint focus:outline-none" />
              </Field>
              <div>
                <div className="mb-2 text-[10.5px] text-faint">Bio</div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell fans what happens here."
                  className="min-h-[78px] w-full resize-none rounded-[13px] border border-white/12 bg-white/[0.06] px-3.5 py-3 text-[13px] font-medium text-white placeholder:text-faint focus:outline-none"
                  maxLength={160}
                />
              </div>
            </div>
            <div className="mt-1.5 mb-2 text-[10.5px] text-faint">Your link</div>
            <div className="flex h-[46px] items-center gap-0.5 rounded-[13px] border border-white/12 bg-white/[0.06] px-3.5">
              <span className="receipt text-[13px] text-faint">tvin.bio/</span>
              <span className="receipt text-[13px] text-white">{username}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-online"><Check className="size-3" /> available</span>
            </div>
            <Button size="lg" className="mt-5 w-full" onClick={createChannel} disabled={saving}>
              {saving ? "Creating…" : "Create channel"}
            </Button>
          </div>
        )}

        {step === "ready" && (
          <div className="relative flex flex-col items-center text-center animate-[tvRise_.3s_ease]">
            <Confetti />
            <div className="flex size-16 items-center justify-center rounded-full bg-online text-white shadow-[0_14px_40px_rgba(34,197,94,.45)] animate-[tvPop_.5s_cubic-bezier(.22,1,.36,1)_both]"><Check className="size-8" /></div>
            <h1 className="font-display mt-5 text-[23px] font-semibold leading-[1.12] tracking-[-0.02em]">Your channel<br />is live.</h1>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">One link. Drop it in your bio — this is your home now.</p>
            <div className="mt-5 flex h-[50px] w-full items-center gap-2 rounded-[14px] border border-white/[0.14] bg-white/[0.06] px-4">
              <span className="receipt text-[13.5px] text-beam-soft">tvin.bio/{profileUsername}</span>
              <button onClick={() => { navigator.clipboard?.writeText(`tvin.bio/${profileUsername}`); toast.success("Link copied"); }} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-dim"><Copy className="size-3" /> Copy</button>
            </div>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={async () => {
                await shareLink({ url: `https://tvin.bio/${profileUsername}`, text: `My channel — tvin.bio/${profileUsername}` });
                setStep("firstrun");
              }}
            >
              Share my link
            </Button>
          </div>
        )}

        {step === "firstrun" && (
          <div className="animate-[tvRise_.3s_ease]">
            <h1 className="font-display text-[21px] font-semibold tracking-[-0.01em]">Let's set you up</h1>
            <div className="mt-1 text-[11.5px] text-muted">3 steps to your first dollar</div>
            <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 rounded-full bg-beam" /></div>
            <div className="mt-5 flex flex-col gap-2.5">
              <Task done icon={<Check className="size-4" />} title="Create your channel" sub="Done" tone="green" />
              <Task active icon={<Play className="size-[15px]" />} title="Go live or upload a video" sub="Give fans something to watch" onClick={() => router.push("/dashboard/broadcast")} />
              <Task icon={<HandCoins className="size-[15px]" />} title="Turn on tips & store" sub="Start earning" onClick={() => router.push("/dashboard/store")} />
            </div>
            <Button size="lg" className="mt-6 w-full" onClick={() => router.push("/dashboard")}>Go to dashboard</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function OnboardingFallback() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
        style={{ background: "radial-gradient(95% 100% at 30% 0%,rgba(64,172,255,.16),transparent 60%)" }}
      />
      <div className="relative w-full max-w-[420px]">
        <Logo size={44} href="" />
        <div className="mt-5 h-[11px] w-24 rounded-full bg-white/10" />
        <div className="mt-4 h-8 w-56 rounded-[10px] bg-white/10" />
        <div className="mt-3 h-4 w-full rounded-full bg-white/[0.07]" />
        <div className="mt-2 h-4 w-4/5 rounded-full bg-white/[0.07]" />
      </div>
    </div>
  );
}

function profileErrorMessage(error: string) {
  if (error === "username_taken") return "That link is already taken";
  if (error === "missing_display_name") return "Add a channel name";
  if (error === "bad_username") return "Use at least 3 letters or numbers";
  if (error === "missing_token" || error === "invalid_token") return "Sign in again to create your channel";
  if (error === "server_unconfigured" || error === "privy_unconfigured") return "Profile provisioning is not configured yet";
  // Invite gate
  if (error === "missing_code" || error === "invalid_code") return "Enter a valid invite code";
  if (error === "inactive") return "That invite code is no longer active";
  if (error === "expired") return "That invite code has expired";
  if (error === "exhausted") return "That invite code has been fully used";
  return "Could not create channel";
}

function Progress({ n, of }: { n: number; of: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: of }).map((_, i) => (
        <div key={i} className={cn("h-[3px] flex-1 rounded-full", i < n ? "bg-blue" : "bg-white/12")} />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="mb-2 text-[10.5px] text-faint">{label}</div>
      <div className="h-[46px] rounded-[13px] border border-white/12 bg-white/[0.06] px-3.5">{children}</div>
    </>
  );
}

function Task({ icon, title, sub, done, active, tone, onClick }: { icon: React.ReactNode; title: string; sub: string; done?: boolean; active?: boolean; tone?: "green"; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={cn(
        "flex items-center gap-3 rounded-[15px] border bg-[#0f0f12] p-3.5 text-left transition",
        done ? "border-online/30" : active ? "border-[1.5px] border-blue " : "border-white/[0.06] opacity-60 hover:opacity-100",
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full",
        done ? "bg-online text-white" : active ? "border-[1.5px] border-blue bg-blue/[0.18] text-blue-light" : "bg-white/[0.06] text-faint")}>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[12.5px] font-semibold text-ink-dim">{title}</span>
        <span className={cn("mt-0.5 block text-[10px]", tone === "green" ? "text-online" : active ? "text-muted" : "text-faint")}>{sub}</span>
      </span>
      {active && <ChevronRight className="size-4 text-blue-light" />}
    </button>
  );
}
