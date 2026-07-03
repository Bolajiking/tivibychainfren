"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Modal from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { CheckCircle2, ChevronLeft, Film, ImagePlus, Link as LinkIcon, Loader2, MoreVertical, Pencil, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/store/session";
import { useHydrated } from "@/lib/store/useHydrated";
import { getMyCreatorProfile } from "@/lib/profile-client";
import { createVideoDraft, requestVodUpload, uploadToTus, syncVideoStatus, updateVideo, deleteVideo, uploadVideoThumbnail } from "@/lib/video-client";
import { MOCK_MODE } from "@/lib/config";
import type { Creator, CreatorProfilePayload, Video, ViewMode } from "@/lib/types";

type Phase = "idle" | "creating" | "requesting" | "uploading";
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
const MODES: { id: ViewMode; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "one-time", label: "Pay-per-view" },
  { id: "monthly", label: "Subscribers" },
];

export function VideoManager() {
  const { user, creator: sessionCreator } = useSession();
  const hydrated = useHydrated();
  const [creator, setCreator] = useState<Creator | null>(sessionCreator);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [amount, setAmount] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Video | null>(null);
  const [deleting, setDeleting] = useState<Video | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const videosRef = useRef<Video[]>([]);
  videosRef.current = videos;

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      if (MOCK_MODE && sessionCreator) {
        setCreator(sessionCreator);
        setVideos([]);
        setLoading(false);
        return;
      }
      try {
        const payload: CreatorProfilePayload | null = await getMyCreatorProfile(user.walletAddress);
        if (!alive) return;
        if (payload?.creator) setCreator(payload.creator);
        setVideos(payload?.videos ?? []);
      } catch {
        if (alive) toast.error("Could not load your videos");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
    // Stable ids only — setCreator writes a new object each fetch (avoids a refetch loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.walletAddress, sessionCreator?.creatorId]);

  // Deep-link from the channel "Upload" button → focus the composer.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compose")) {
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Auto-poll transcoding videos so "processing" flips to "ready" without a manual check.
  const hasProcessing = videos.some((v) => v.status === "processing");
  useEffect(() => {
    if (MOCK_MODE || !user || !hasProcessing) return;
    const wallet = user.walletAddress;
    let alive = true;
    const timer = setInterval(async () => {
      const pending = videosRef.current.filter((v) => v.status === "processing");
      for (const v of pending) {
        try {
          const status = await syncVideoStatus(v, wallet);
          if (!alive) return;
          if (status !== v.status) setVideos((list) => list.map((x) => (x.playbackId === v.playbackId ? { ...x, status } : x)));
        } catch {
          /* keep polling */
        }
      }
    }, 7000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [hasProcessing, user]);

  const busy = phase !== "idle";

  function chooseFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    const error = validateVideoFile(next);
    if (error) {
      toast.error(error);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(next);
  }

  async function handleUpload() {
    if (!user) return;
    if (!title.trim()) return toast.error("Add a video title");
    if (viewMode !== "free" && (!Number(amount) || Number(amount) <= 0)) return toast.error("Set a price for paid videos");
    if (!MOCK_MODE && !file) return toast.error("Choose a video file");

    setPhase("creating");
    try {
      const video = await createVideoDraft(
        { title: title.trim(), viewMode, amount: viewMode === "free" ? 0 : amount, thumbnailUrl },
        user.walletAddress,
      );
      setVideos((list) => [{ ...video, thumbnailUrl: video.thumbnailUrl ?? thumbnailPreview ?? undefined }, ...list]);

      if (file && !MOCK_MODE) {
        setPhase("requesting");
        const target = await requestVodUpload(video.playbackId, title.trim(), user.walletAddress);
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        setPhase("uploading");
        setProgress(0);
        await uploadToTus(target.tusEndpoint, file, setProgress, controller.signal);
        setVideos((list) =>
          list.map((v) =>
            v.playbackId === video.playbackId ? { ...v, livepeerPlaybackId: target.playbackId } : v,
          ),
        );
        toast.success("Uploaded — processing now");
      } else {
        toast.success(MOCK_MODE ? "Draft saved (upload needs the live video backend)" : "Draft saved");
      }
      resetForm();
    } catch (error) {
      toast.error(uploadError(error));
    } finally {
      uploadAbortRef.current = null;
      setPhase("idle");
      setProgress(0);
    }
  }

  function cancelUpload() {
    uploadAbortRef.current?.abort();
  }

  function resetForm() {
    setTitle("");
    setViewMode("free");
    setAmount("0");
    setFile(null);
    setThumbnailUrl(null);
    setThumbnailPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    if (thumbRef.current) thumbRef.current.value = "";
  }

  async function chooseThumbnail(file: File | null) {
    if (!file) return;
    const error = validateImageFile(file);
    if (error) {
      toast.error(error);
      if (thumbRef.current) thumbRef.current.value = "";
      return;
    }
    const preview = URL.createObjectURL(file);
    setThumbnailPreview(preview);
    if (MOCK_MODE) {
      setThumbnailUrl(preview);
      return;
    }
    if (!user) return;
    setThumbnailUploading(true);
    try {
      const url = await uploadVideoThumbnail(file, user.walletAddress);
      if (url) setThumbnailUrl(url);
    } catch {
      toast.error("Couldn't upload thumbnail");
      setThumbnailPreview(null);
      setThumbnailUrl(null);
    } finally {
      setThumbnailUploading(false);
    }
  }

  async function sync(video: Video) {
    if (!user) return;
    setSyncingId(video.playbackId);
    try {
      const status = await syncVideoStatus(video, user.walletAddress);
      setVideos((list) => list.map((v) => (v.playbackId === video.playbackId ? { ...v, status } : v)));
      toast[status === "ready" ? "success" : "message"](
        status === "ready" ? "Video is ready" : status === "not_found" ? "Not found yet" : "Still processing",
      );
    } catch {
      toast.error("Couldn't check status");
    } finally {
      setSyncingId(null);
    }
  }

  async function saveEdit(next: { title: string; viewMode: ViewMode; amount: string }) {
    if (!user || !editing) return;
    const target = editing;
    try {
      const updated = await updateVideo(
        target.playbackId,
        { title: next.title.trim(), viewMode: next.viewMode, amount: next.viewMode === "free" ? 0 : next.amount },
        user.walletAddress,
      );
      setVideos((list) =>
        list.map((v) =>
          v.playbackId === target.playbackId
            ? { ...v, ...(updated ?? { title: next.title.trim(), viewMode: next.viewMode, amount: Number(next.amount) || 0 }) }
            : v,
        ),
      );
      setEditing(null);
      toast.success("Video updated");
    } catch {
      toast.error("Couldn't update video");
    }
  }

  async function confirmDelete() {
    if (!user || !deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await deleteVideo(target.playbackId, user.walletAddress);
      setVideos((list) => list.filter((v) => v.playbackId !== target.playbackId));
      toast.success("Video deleted");
    } catch {
      toast.error("Couldn't delete video");
    }
  }

  const sorted = useMemo(() => videos, [videos]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between border-b border-white/[0.06] bg-canvas/80 px-4 backdrop-blur md:px-5">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-[14px] font-semibold text-muted">Videos</span>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-white">
          <ChevronLeft className="size-4" /> Dashboard
        </Link>
      </header>

      {!hydrated || (loading && user) ? (
        <Skeleton />
      ) : !user ? (
        <EmptyState />
      ) : (
        <div className="mx-auto grid max-w-[1000px] gap-5 px-4 py-6 lg:grid-cols-[380px_1fr]">
          {/* upload composer */}
          <section className="h-fit rounded-2xl border border-white/[0.08] bg-[#0a0a0c] p-4 lg:sticky lg:top-[68px]">
            <div className="mb-1 font-display text-[16px] font-semibold">Upload a replay</div>
            <p className="mb-3.5 text-[11.5px] text-faint">Share a recorded video your fans can watch any time.</p>
            <div className="flex flex-col gap-2.5">
              <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" className="h-11 rounded-[12px] border border-white/12 bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none" />

              <div>
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-faint">Access</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setViewMode(m.id)}
                      className={`rounded-[10px] py-2 text-[11px] font-semibold transition ${viewMode === m.id ? "bg-blue text-white" : "bg-white/[0.05] text-muted hover:text-white"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {viewMode !== "free" && (
                  <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5">
                    <span className="text-muted">$</span>
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="h-11 flex-1 bg-transparent text-sm text-white placeholder:text-faint focus:outline-none" />
                    <span className="text-[11px] text-faint">{viewMode === "monthly" ? "/mo" : "once"} · USDC</span>
                  </div>
                )}
              </div>

              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); chooseFile(e.dataTransfer.files?.[0] ?? null); }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed px-3 py-6 text-center transition ${dragOver ? "border-blue bg-blue/[0.08]" : "border-white/14 bg-white/[0.03] hover:border-blue/50"}`}
              >
                <UploadCloud className={`size-6 ${dragOver ? "text-blue-light" : "text-ink-dim"}`} />
                <span className="max-w-full truncate text-[12px] font-semibold text-ink-dim">{file ? file.name : "Drag a video here, or browse"}</span>
                <span className="text-[10.5px] text-faint">{file ? `${formatFileSize(file.size)} · resumable upload` : "MP4 / MOV / WebM · up to 5 GB"}</span>
                <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-white/12 bg-white/[0.04] p-3 transition hover:border-blue/50">
                <span className="relative flex size-[70px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.05] text-faint">
                  {thumbnailPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailPreview} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                  {thumbnailUploading && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin text-white" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-ink-dim">Thumbnail</span>
                  <span className="mt-0.5 block text-[10.5px] leading-relaxed text-faint">Optional poster image. 16:9 JPEG, PNG, WEBP or GIF up to 5 MB.</span>
                </span>
                <input ref={thumbRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => chooseThumbnail(e.target.files?.[0] ?? null)} />
              </label>

              {(phase === "requesting" || phase === "uploading") && (
                <div className="rounded-[14px] border border-blue/20 bg-blue/[0.08] p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-blue-soft">
                    <span>{phase === "requesting" ? "Preparing upload" : "Uploading video"}</span>
                    <span>{phase === "uploading" ? `${progress}%` : "secure"}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-blue transition-[width] duration-300" style={{ width: `${phase === "uploading" ? progress : 18}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-relaxed text-muted">
                      {phase === "requesting" ? "Setting up a secure, private upload." : "Keep this tab open — the upload resumes automatically if your connection drops."}
                    </p>
                    {phase === "uploading" && (
                      <button type="button" onClick={cancelUpload} className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-ink-dim hover:text-white" aria-label="Cancel upload">
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <Button size="lg" onClick={handleUpload} disabled={busy || thumbnailUploading} className="mt-0.5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                {phase === "creating" ? "Saving…" : phase === "requesting" ? "Preparing…" : phase === "uploading" ? "Uploading…" : "Upload video"}
              </Button>
              <p className="text-[11px] leading-relaxed text-faint">After upload it shows as processing while we get it ready — it publishes to your channel automatically when done.</p>
            </div>
          </section>

          {/* library */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-dim">Your library</span>
              {sorted.length > 0 && <span className="text-[11px] text-faint">{sorted.length} {sorted.length === 1 ? "video" : "videos"}</span>}
            </div>
            {sorted.length ? (
              <div className="flex flex-col gap-2.5">
                {sorted.map((video) => (
                  <VideoRow
                    key={video.playbackId}
                    video={video}
                    username={creator?.username}
                    busy={syncingId === video.playbackId}
                    onSync={() => sync(video)}
                    onEdit={() => setEditing(video)}
                    onRemove={() => setDeleting(video)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-14 text-center">
                <Film className="size-7 text-ghost" />
                <div className="text-[13px] font-semibold text-ink-dim">No replays yet</div>
                <div className="text-[11.5px] text-faint">Upload your first one to give fans something to watch.</div>
              </div>
            )}
          </section>
        </div>
      )}

      <EditDialog video={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
      <ConfirmDialog video={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
    </div>
  );
}

function VideoRow({ video, username, busy, onSync, onEdit, onRemove }: { video: Video; username?: string; busy: boolean; onSync: () => void; onEdit: () => void; onRemove: () => void }) {
  const ready = video.status === "ready";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0a0a0c] p-3">
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: `linear-gradient(140deg,${video.thumbColor},#101010)` }}>
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <Film className="size-5 text-white/70" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{video.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
          <StatusBadge status={video.status} />
          <span>·</span>
          <span className="capitalize">{video.viewMode === "free" ? "Free" : `${video.viewMode} · $${video.amount}`}</span>
        </div>
      </div>
      {ready && username ? (
        <Link href={`/${username}/video/${video.playbackId}`} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-blue hover:text-blue-light">
          <LinkIcon className="size-3.5" /> <span className="hidden sm:inline">View</span>
        </Link>
      ) : (
        <button onClick={onSync} disabled={busy} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-dim hover:text-white disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} <span className="hidden sm:inline">Check</span>
        </button>
      )}
      <Menu.Root>
        <Menu.Trigger asChild>
          <button className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-ink-dim hover:text-white" aria-label={`Manage ${video.title}`}>
            <MoreVertical className="size-4" />
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" className="z-50 min-w-36 rounded-xl border border-white/10 bg-elevated p-1.5 text-[12px] text-ink-dim shadow-[0_18px_50px_rgba(0,0,0,.45)]">
            <Menu.Item onSelect={onEdit} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none hover:bg-white/[0.07] hover:text-white">
              <Pencil className="size-3.5" /> Edit
            </Menu.Item>
            <Menu.Item onSelect={onRemove} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-red-200 outline-none hover:bg-red-500/10 hover:text-white">
              <Trash2 className="size-3.5" /> Delete
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

function EditDialog({ video, onClose, onSave }: { video: Video | null; onClose: () => void; onSave: (next: { title: string; viewMode: ViewMode; amount: string }) => void }) {
  const [title, setTitle] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("free");
  const [amount, setAmount] = useState("0");

  useEffect(() => {
    if (video) {
      setTitle(video.title);
      setViewMode(video.viewMode);
      setAmount(String(video.amount ?? 0));
    }
  }, [video]);

  return (
    <Modal.Root open={!!video} onOpenChange={(v) => !v && onClose()}>
      <Modal.Portal>
        <Modal.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-[tvFadeIn_.2s_ease]" />
        <Modal.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-white/12 bg-elevated p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,.6)] focus:outline-none data-[state=open]:animate-[tvCenterIn_.26s_cubic-bezier(.22,1,.36,1)]">
          <Modal.Title className="font-display text-[17px] font-semibold">Edit video</Modal.Title>
          <Modal.Description asChild><VisuallyHidden>Edit video details</VisuallyHidden></Modal.Description>
          <div className="mt-4 flex flex-col gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Video title" className="h-11 rounded-[12px] border border-white/12 bg-white/[0.06] px-3.5 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none" />
            <div className="grid grid-cols-3 gap-1.5">
              {MODES.map((m) => (
                <button key={m.id} onClick={() => setViewMode(m.id)} className={`rounded-[10px] py-2 text-[11px] font-semibold transition ${viewMode === m.id ? "bg-blue text-white" : "bg-white/[0.05] text-muted hover:text-white"}`}>{m.label}</button>
              ))}
            </div>
            {viewMode !== "free" && (
              <div className="flex items-center gap-2 rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5">
                <span className="text-muted">$</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-11 flex-1 bg-transparent text-sm text-white focus:outline-none" />
                <span className="text-[11px] text-faint">{viewMode === "monthly" ? "/mo" : "once"}</span>
              </div>
            )}
          </div>
          <div className="mt-5 flex gap-2.5">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={() => onSave({ title, viewMode, amount })} disabled={!title.trim() || (viewMode !== "free" && (!Number(amount) || Number(amount) <= 0))}>Save</Button>
          </div>
        </Modal.Content>
      </Modal.Portal>
    </Modal.Root>
  );
}

function ConfirmDialog({ video, onClose, onConfirm }: { video: Video | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal.Root open={!!video} onOpenChange={(v) => !v && onClose()}>
      <Modal.Portal>
        <Modal.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-[tvFadeIn_.2s_ease]" />
        <Modal.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-white/12 bg-elevated p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,.6)] focus:outline-none data-[state=open]:animate-[tvCenterIn_.26s_cubic-bezier(.22,1,.36,1)]">
          <Modal.Title className="font-display text-[17px] font-semibold">Delete this video?</Modal.Title>
          <Modal.Description className="mt-2 text-[12.5px] leading-relaxed text-muted">
            “{video?.title}” will be removed and fans will no longer see it. This can’t be undone.
          </Modal.Description>
          <div className="mt-5 flex gap-2.5">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="live" className="flex-1" onClick={onConfirm}>Delete</Button>
          </div>
        </Modal.Content>
      </Modal.Portal>
    </Modal.Root>
  );
}

function StatusBadge({ status }: { status: Video["status"] }) {
  if (status === "ready") {
    return <span className="inline-flex items-center gap-1 text-blue-soft"><CheckCircle2 className="size-3.5" /> Ready</span>;
  }
  if (status === "not_found") return <span className="text-red-300">Missing</span>;
  return <span className="inline-flex items-center gap-1 text-faint"><Loader2 className="size-3 animate-spin" /> Processing</span>;
}

function Skeleton() {
  return (
    <div className="mx-auto grid max-w-[1000px] gap-5 px-4 py-6 lg:grid-cols-[380px_1fr]">
      <div className="h-[320px] animate-pulse rounded-2xl bg-white/[0.06]" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-white/[0.06]" />)}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div className="max-w-[380px]">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Sign in to manage videos</h1>
        <p className="mt-2 text-[13px] text-muted">Upload replays once your channel profile is ready.</p>
        <Button asChild size="lg" className="mt-5"><Link href="/onboarding">Set up profile</Link></Button>
      </div>
    </div>
  );
}

function validateVideoFile(file: File): string | null {
  const supported = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
  if (!supported) return "Choose an MP4, MOV, or WebM video";
  if (file.size > MAX_VIDEO_BYTES) return "Choose a video under 5 GB";
  if (file.size <= 0) return "Choose a valid video file";
  return null;
}

function validateImageFile(file: File): string | null {
  const supported = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type);
  if (!supported) return "Choose a PNG, JPG, WEBP or GIF thumbnail";
  if (file.size > 5 * 1024 * 1024) return "Choose a thumbnail under 5 MB";
  if (file.size <= 0) return "Choose a valid thumbnail";
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const UPLOAD_ERRORS: Record<string, string> = {
  livepeer_unconfigured: "Video upload isn't configured on the server yet",
  server_unconfigured: "The video backend isn't configured yet",
  missing_video_title: "Add a video title",
  bad_video_amount: "Add a valid price",
  no_upload_target: "Couldn't start the upload — try again",
  asset_mapping_failed: "Couldn't link the upload to this video",
  video_not_found: "Couldn't find the video draft — try again",
  video_write_failed: "Couldn't save the video — please try again.",
  creator_profile_missing: "Set up your channel profile before uploading videos.",
  video_request_failed: "The server rejected the upload. Try again.",
  route_not_allowed: "Upload route unavailable",
  not_resource_owner: "This video belongs to another account",
  upstream_unreachable: "The video service is unreachable right now. Try again in a moment.",
  missing_tvinbio_playback_id: "Upload reference missing — try again",
  livepeer_response_invalid: "The video service returned an unexpected response",
  invalid_json: "The request was malformed — try again",
  missing_token: "Sign in again to upload",
  invalid_token: "Sign in again to upload",
};

function uploadError(error: unknown) {
  if (typeof console !== "undefined") console.error("[vod upload] failed:", error);
  if (!(error instanceof Error)) return "Upload failed";
  const code = error.message;
  if (error.name === "AbortError" || code === "Upload cancelled") return "Upload cancelled";
  if (UPLOAD_ERRORS[code]) return UPLOAD_ERRORS[code];
  // tus / network / unknown — never an opaque message; surface the real reason.
  return code ? `Upload failed: ${code}` : "Upload failed";
}
