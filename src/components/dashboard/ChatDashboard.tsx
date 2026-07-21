"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, ShieldCheck, Clock, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DashboardShell, DashboardEmpty, Panel, useCreatorProfile, PageSkeleton } from "@/components/dashboard/DashboardScaffold";
import { useSession } from "@/lib/store/session";

type ChatSettings = {
  subscribersOnly: boolean;
  slowModeSec: number;
  profanityFilter: boolean;
  blockedWords: string[];
  mods: string[];
};

const DEFAULTS: ChatSettings = { subscribersOnly: false, slowModeSec: 0, profanityFilter: true, blockedWords: [], mods: [] };
const SLOW_OPTIONS = [0, 5, 15, 30, 60];
const key = (id: string) => `tvinbio-chat-settings-${id.toLowerCase()}`;

export function ChatDashboard() {
  const user = useSession((s) => s.user);
  const { creator, loading } = useCreatorProfile();

  const [settings, setSettings] = useState<ChatSettings>(DEFAULTS);
  const [wordInput, setWordInput] = useState("");
  const [modInput, setModInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Load persisted moderation settings for this channel.
  useEffect(() => {
    if (!creator) return;
    try {
      const raw = localStorage.getItem(key(creator.creatorId));
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      else setSettings(DEFAULTS);
    } catch {
      setSettings(DEFAULTS);
    }
  }, [creator?.creatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <DashboardShell title="Chat" active="chat" creator={creator}><PageSkeleton /></DashboardShell>;
  if (!user || !creator) {
    return (
      <DashboardShell title="Chat" active="chat" creator={creator}>
        <DashboardEmpty icon={<MessageSquare className="size-5" />} title="Set up your channel first" body="Live chat and moderation tools come with your channel — set up your profile to open the room." />
      </DashboardShell>
    );
  }

  function save() {
    setSaving(true);
    try {
      localStorage.setItem(key(creator!.creatorId), JSON.stringify(settings));
      toast.success("Chat settings saved");
    } catch {
      toast.error("Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  function addWord() {
    const w = wordInput.trim().toLowerCase();
    if (!w || settings.blockedWords.includes(w)) return setWordInput("");
    setSettings((s) => ({ ...s, blockedWords: [...s.blockedWords, w] }));
    setWordInput("");
  }
  function addMod() {
    const m = modInput.trim();
    if (!m || settings.mods.includes(m)) return setModInput("");
    setSettings((s) => ({ ...s, mods: [...s.mods, m] }));
    setModInput("");
  }

  return (
    <DashboardShell
      title="Chat"
      active="chat"
      creator={creator}
      actions={<Button onClick={save} size="pill" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>}
    >
      <div className="mb-5">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Chat & community</h1>
        <p className="mt-1 text-[12.5px] text-muted">Control who can talk in your live room and keep it healthy.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* access + automod */}
        <Panel title="Room rules">
          <div className="flex flex-col gap-2.5">
            <ToggleRow
              icon={<UserPlus className="size-4" />}
              label="Subscribers-only chat"
              hint="Only members can send messages"
              on={settings.subscribersOnly}
              onToggle={() => setSettings((s) => ({ ...s, subscribersOnly: !s.subscribersOnly }))}
            />
            <ToggleRow
              icon={<ShieldCheck className="size-4" />}
              label="Profanity filter"
              hint="Auto-hide messages with flagged words"
              on={settings.profanityFilter}
              onToggle={() => setSettings((s) => ({ ...s, profanityFilter: !s.profanityFilter }))}
            />
            <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold"><Clock className="size-4 text-faint" /> Slow mode</div>
              <div className="mt-2.5 flex gap-1.5">
                {SLOW_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSettings((cur) => ({ ...cur, slowModeSec: s }))}
                    className={`flex-1 rounded-[10px] py-1.5 text-[11px] font-semibold transition ${settings.slowModeSec === s ? "bg-beam text-white" : "bg-white/[0.05] text-muted hover:text-white"}`}
                  >
                    {s === 0 ? "Off" : `${s}s`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* moderators */}
        <Panel title="Moderators">
          <p className="text-[11.5px] text-muted">Add wallet addresses or handles that can moderate your chat.</p>
          <form
            onSubmit={(e) => { e.preventDefault(); addMod(); }}
            className="mt-3 flex gap-2"
          >
            <input value={modInput} onChange={(e) => setModInput(e.target.value)} placeholder="@handle or 0x…" className={INPUT} />
            <Button type="submit" variant="secondary" size="pill">Add</Button>
          </form>
          <div className="mt-3 flex flex-col gap-2">
            {settings.mods.length ? settings.mods.map((m) => (
              <div key={m} className="flex items-center justify-between rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <span className="truncate text-[12px] text-ink-soft">{m}</span>
                <button onClick={() => setSettings((s) => ({ ...s, mods: s.mods.filter((x) => x !== m) }))} className="text-faint hover:text-white"><X className="size-3.5" /></button>
              </div>
            )) : <div className="rounded-[10px] border border-dashed border-white/10 py-5 text-center text-[11px] text-faint">No moderators yet</div>}
          </div>
        </Panel>

        {/* blocked words */}
        <Panel title="Blocked words" className="lg:col-span-2">
          <form
            onSubmit={(e) => { e.preventDefault(); addWord(); }}
            className="flex gap-2"
          >
            <input value={wordInput} onChange={(e) => setWordInput(e.target.value)} placeholder="Add a word or phrase to block" className={INPUT} />
            <Button type="submit" variant="secondary" size="pill">Block</Button>
          </form>
          {settings.blockedWords.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {settings.blockedWords.map((w) => (
                <span key={w} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-3 pr-2 text-[11.5px] text-ink-dim">
                  {w}
                  <button onClick={() => setSettings((s) => ({ ...s, blockedWords: s.blockedWords.filter((x) => x !== w) }))} className="text-faint hover:text-white"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-[10px] border border-dashed border-white/10 py-5 text-center text-[11px] text-faint">No blocked words — your filter list is empty.</div>
          )}
        </Panel>
      </div>
    </DashboardShell>
  );
}

const INPUT = "h-[42px] flex-1 rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5 text-[13px] text-white placeholder:text-faint focus:border-beam/60 focus:outline-none";

function ToggleRow({ icon, label, hint, on, onToggle }: { icon: React.ReactNode; label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center justify-between rounded-[12px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-faint">{icon}</span>
        <div>
          <div className="text-[12.5px] font-semibold">{label}</div>
          <div className="text-[10.5px] text-faint">{hint}</div>
        </div>
      </div>
      <button onClick={onToggle} type="button" aria-pressed={on} className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition ${on ? "bg-beam" : "bg-white/15"}`}>
        <span className={`absolute top-[3px] size-[20px] rounded-full bg-white transition-[left] duration-200 ease-[cubic-bezier(.22,1,.36,1)] ${on ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </label>
  );
}
