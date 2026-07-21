"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { Mark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/store/session";
import { config, MOCK_MODE } from "@/lib/config";
import {
  provisionCreatorProfile,
  redeemInvite,
  uploadChannelArt,
  checkCreatorAccess,
  getMyCreatorProfile,
} from "@/lib/profile-client";
import { slugifyUsername } from "@/lib/profile";
import { buildAuthHref } from "@/lib/auth/redirect";
import { ACCENT_PRESETS, DEFAULT_ACCENT, creatorThemeVars } from "@/lib/creator-theme";
import { useHydrated } from "@/lib/store/useHydrated";
import { cn } from "@/lib/cn";
import type { Creator } from "@/lib/types";

type Step = "invite" | "brand";
/** The three brand-setup steps, each skippable (framework F4). */
const BRAND_STEPS = ["identity", "accent", "cover"] as const;
type BrandStep = (typeof BRAND_STEPS)[number];

export default function Onboarding() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingFlow />
    </Suspense>
  );
}

/**
 * F4, steps two and three — brand setup, then straight to one dominant action.
 *
 * Every step shows the creator's page assembling itself in a live preview, so
 * the thing they're building is visible before it exists. Every step is
 * skippable: the 60-second claim-to-live path can't be gated on taste.
 */
function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const { login, user, creator: sessionCreator, setCreator } = useSession();

  const [step, setStep] = useState<Step>("invite");
  const [brandStep, setBrandStep] = useState<BrandStep>("identity");
  const [code, setCode] = useState("");
  const [granted, setGranted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const entryChecked = useRef(false);
  const username = slugifyUsername(handle || name || user?.displayName || "") || "yourname";

  // The handle claimed on /start arrives here; it's the whole point of the URL.
  useEffect(() => {
    const claimed = searchParams.get("handle");
    if (claimed && !handle) setHandle(claimed);
  }, [searchParams, handle]);

  useEffect(() => {
    const fromUrl = searchParams.get("code");
    if (fromUrl && !code) setCode(fromUrl.toUpperCase());
  }, [searchParams, code]);

  useEffect(() => {
    if (user?.displayName && !name) setName(user.displayName === "You" ? "" : user.displayName);
  }, [name, user?.displayName]);

  // Entry routing — one channel per account, so an existing creator is sent to
  // their dashboard rather than offered a second claim.
  useEffect(() => {
    if (!hydrated || !user || entryChecked.current) return;
    entryChecked.current = true;
    let alive = true;
    (async () => {
      if (sessionCreator) {
        router.replace("/dashboard");
        return;
      }
      if (MOCK_MODE) {
        setStep("brand");
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
      setStep(has ? "brand" : "invite");
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user]);

  async function passInviteGate() {
    if (!user) {
      if (config.privy.enabled) {
        toast("Sign in first, then enter your invite code");
        const next = `/onboarding?${new URLSearchParams({
          ...(handle ? { handle } : {}),
          ...(code ? { code } : {}),
        })}`;
        router.push(buildAuthHref({ role: "creator", next }));
        return;
      }
      login("You");
      setStep("brand");
      return;
    }
    if (MOCK_MODE || granted) return setStep("brand");
    if (!code.trim()) return toast.error("Enter your invite code");

    setSaving(true);
    try {
      await redeemInvite(code, user.walletAddress);
      setGranted(true);
      setStep("brand");
    } catch (error) {
      toast.error(profileErrorMessage(error instanceof Error ? error.message : "invalid_code"));
    } finally {
      setSaving(false);
    }
  }

  function advance() {
    const index = BRAND_STEPS.indexOf(brandStep);
    if (index < BRAND_STEPS.length - 1) setBrandStep(BRAND_STEPS[index + 1]);
    else void createChannel();
  }

  async function createChannel() {
    if (!user) return passInviteGate();
    if (!name.trim()) {
      setBrandStep("identity");
      return toast.error("Add a channel name");
    }

    setSaving(true);
    try {
      if (!MOCK_MODE && !granted) await redeemInvite(code, user.walletAddress);
      const payload = await provisionCreatorProfile(
        { displayName: name, username, bio, accentColor: accent, themeVariant: "midnight" },
        user.walletAddress,
      );

      let creator: Creator = payload.creator;
      if (!MOCK_MODE) {
        // Art uploads need the creator row to exist first, so they land here.
        if (avatarFile) {
          const avatarUrl = await uploadChannelArt(avatarFile, user.walletAddress).catch(() => null);
          if (avatarUrl) creator = { ...creator, avatarUrl };
        }
        if (coverFile) {
          const headerUrl = await uploadChannelArt(coverFile, user.walletAddress, "header").catch(() => null);
          if (headerUrl) creator = { ...creator, headerUrl };
        }
      }

      setCreator(creator);
      // Straight to the one dominant action — the dashboard shows the timer.
      router.push(`/dashboard?claimed=${Date.now()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "profile_request_failed";
      toast.error(profileErrorMessage(message));
      if (message === "username_taken") setBrandStep("identity");
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) return <OnboardingFallback />;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-canvas px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
        style={{ background: "radial-gradient(95% 100% at 30% 0%, rgba(64,172,255,0.14), transparent 60%)" }}
      />

      <div className="relative mx-auto w-full max-w-[420px]">
        {step === "invite" ? (
          <div className="animate-[tvRise_.3s_var(--ease-expo)]">
            <Mark size={40} className="text-ink-soft" />
            <div className="mt-5 inline-flex rounded-full border border-beam/45 px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-beam-soft">
              INVITE ONLY
            </div>
            <h1 className="font-display mt-4 text-[30px] font-semibold leading-[1.05] tracking-[-0.02em]">
              Claim your channel
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Enter your invite code to start building the platform the algorithm wouldn&apos;t let you.
            </p>
            <p className="outcome mt-2 text-[14px] text-muted">a link you own, not one you rent</p>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ADA·2K"
              aria-label="Invite code"
              className="receipt mt-5 h-[52px] w-full rounded-[14px] border-2 border-beam bg-beam/[0.05] text-center text-base tracking-[0.28em] text-white placeholder:text-ghost focus:outline-none"
            />
            <Button size="lg" className="mt-3 w-full" onClick={passInviteGate} disabled={saving}>
              {saving ? "Checking…" : "Continue"}
            </Button>
          </div>
        ) : (
          <div className="animate-[tvRise_.3s_var(--ease-expo)]">
            <StepBar active={BRAND_STEPS.indexOf(brandStep)} total={BRAND_STEPS.length} />

            {brandStep === "identity" && (
              <BrandStepShell title="Name your channel">
                <div className="flex items-center gap-3.5">
                  <label className="group relative grid size-[68px] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/20 text-faint hover:border-white/40">
                    {avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarPreview} alt="" className="absolute inset-0 size-full object-cover" />
                    ) : (
                      <ImagePlus className="size-5" />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setAvatarFile(file);
                        setAvatarPreview(file ? URL.createObjectURL(file) : null);
                      }}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                      aria-label="Channel name"
                      className="h-[46px] w-full rounded-[13px] border border-white/12 bg-white/[0.05] px-3.5 text-[14px] text-white placeholder:text-faint focus:border-beam focus:outline-none"
                    />
                    <div className="receipt mt-2 flex h-[38px] items-center gap-0.5 rounded-[11px] border border-white/[0.08] px-3.5 text-[12.5px]">
                      <span className="text-faint">tvin.bio/</span>
                      <span className="truncate text-ink-soft">{username}</span>
                    </div>
                  </div>
                </div>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Tell fans what happens here."
                  maxLength={160}
                  aria-label="Bio"
                  className="mt-3 min-h-[72px] w-full resize-none rounded-[13px] border border-white/12 bg-white/[0.05] px-3.5 py-3 text-[13px] text-white placeholder:text-faint focus:border-beam focus:outline-none"
                />
              </BrandStepShell>
            )}

            {brandStep === "accent" && (
              <BrandStepShell title="Pick your accent">
                <div className="flex flex-wrap gap-2.5">
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAccent(preset)}
                      aria-label={`Accent ${preset}`}
                      aria-pressed={accent === preset}
                      className={cn(
                        "size-11 rounded-full transition-transform active:scale-95",
                        accent === preset && "border-[3px] border-white",
                      )}
                      style={{ background: preset }}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-faint">
                  Every color is auto-tuned to stay readable on dark. Red and green are reserved —
                  they mean live and money.
                </p>
              </BrandStepShell>
            )}

            {brandStep === "cover" && (
              <BrandStepShell title="Add a cover">
                <label className="group relative grid h-[120px] w-full cursor-pointer place-items-center overflow-hidden rounded-[16px] border-2 border-dashed border-white/20 text-faint hover:border-white/40">
                  {coverPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverPreview} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="flex items-center gap-2 text-[12.5px]">
                      <ImagePlus className="size-4" /> Cover image
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setCoverFile(file);
                      setCoverPreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                <p className="mt-3 text-[12px] leading-relaxed text-faint">
                  Skip it — you can add one from your channel any time.
                </p>
              </BrandStepShell>
            )}

            <ChannelPreview
              name={name || "Your channel"}
              username={username}
              accent={accent}
              avatar={avatarPreview}
              cover={coverPreview}
            />

            <div className="mt-5 flex gap-2">
              <Button variant="ghost" size="lg" onClick={advance} disabled={saving}>
                Skip
              </Button>
              <Button size="lg" className="flex-1" onClick={advance} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-[18px] animate-spin" />
                ) : brandStep === "cover" ? (
                  "Create my channel"
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandStepShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="font-display mt-4 text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
      <div className="mt-4">{children}</div>
    </>
  );
}

/**
 * The page assembling itself. Seeing the real thing — accent ring, display
 * name, the typed URL — is what makes the setup steps feel like building
 * rather than filling in a form.
 */
function ChannelPreview({
  name,
  username,
  accent,
  avatar,
  cover,
}: {
  name: string;
  username: string;
  accent: string;
  avatar: string | null;
  cover: string | null;
}) {
  return (
    <div
      className="mt-6 overflow-hidden rounded-[18px] border border-white/10 bg-surface-2"
      style={creatorThemeVars(accent, "midnight")}
    >
      <div className="receipt px-4 pt-4 text-[10px] tracking-[0.1em] text-ghost">
        LIVE PREVIEW — YOUR PAGE, ASSEMBLING
      </div>
      <div className="relative mt-3 h-[52px]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="accent-ambient absolute inset-0" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface-2 to-transparent" />
      </div>
      <div className="px-4 pb-4">
        <div className="-mt-5 flex items-end gap-3">
          <div
            className="relative size-[46px] shrink-0 overflow-hidden rounded-full border-2"
            style={{ borderColor: accent, background: "linear-gradient(135deg,#3a3a3a,#141414)" }}
          >
            {avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="absolute inset-0 size-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-[17px] font-semibold tracking-[-0.01em]">{name}</div>
            <div className="receipt text-[10px] text-muted">tvin.bio/{username}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex h-[34px] flex-1 items-center justify-center rounded-full text-[11px] font-semibold text-on-accent" style={{ background: accent }}>
            Follow
          </span>
          <span className="flex h-[34px] flex-1 items-center justify-center rounded-full border border-white/[0.16] text-[11px] font-semibold text-ink-dim">
            Store
          </span>
        </div>
      </div>
    </div>
  );
}

function StepBar({ active, total }: { active: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          className={cn("h-[3px] flex-1 rounded-full", index <= active ? "bg-beam" : "bg-white/12")}
        />
      ))}
    </div>
  );
}

function OnboardingFallback() {
  return (
    <div className="relative min-h-[100dvh] bg-canvas px-5 py-10">
      <div className="mx-auto w-full max-w-[420px]">
        <Mark size={40} className="text-ink-soft" />
        <div className="mt-5 h-[11px] w-24 rounded-full bg-raised" />
        <div className="mt-4 h-8 w-56 rounded-[10px] bg-raised" />
        <div className="mt-3 h-4 w-full rounded-full bg-raised opacity-70" />
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
  if (error === "missing_code" || error === "invalid_code") return "Enter a valid invite code";
  if (error === "inactive") return "That invite code is no longer active";
  if (error === "expired") return "That invite code has expired";
  if (error === "exhausted") return "That invite code has been fully used";
  return "Could not create channel";
}
