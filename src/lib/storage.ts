import type { supabaseAdmin } from "@/lib/db/client";

/** Server-side image upload to the public channel-art bucket. */
const CHANNEL_ART_BUCKET = "channel-art";
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

type ImageUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

/**
 * Validate + upload an image file to the public bucket under `prefix/...` and
 * return its public URL. Used by both the avatar and product-image routes.
 */
export async function uploadImage(
  db: NonNullable<ReturnType<typeof supabaseAdmin>>,
  prefix: string,
  file: File,
): Promise<ImageUploadResult> {
  if (file.size > MAX_BYTES) return { ok: false, error: "file_too_large", status: 400 };
  const ext = EXT[file.type];
  if (!ext) return { ok: false, error: "unsupported_type", status: 400 };

  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await db.storage.from(CHANNEL_ART_BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (up.error) return { ok: false, error: "upload_failed", status: 500 };

  return { ok: true, url: db.storage.from(CHANNEL_ART_BUCKET).getPublicUrl(path).data.publicUrl };
}
