"use client";

import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { Archive, CheckCircle2, ImagePlus, Loader2, MoreVertical, PackageCheck, Pencil, Plus, ShieldCheck } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Tile } from "@/components/ui/Media";
import { createCreatorProduct, updateCreatorProduct, updateCreatorProductStatus, uploadProductImage } from "@/lib/creator-client";
import { MOCK_MODE } from "@/lib/config";
import type { Creator, Product, Stream } from "@/lib/types";

const BLANK = { name: "", description: "", price: "", inventory: "50", productType: "merch" as Product["productType"], subsOnly: false };

export function StoreManager({ initial, creator, stream }: { initial: Product[]; creator: Creator; stream: Stream | null }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(BLANK);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setItems(initial), [initial]);

  const set = (patch: Partial<typeof BLANK>) => setForm((f) => ({ ...f, ...patch }));

  function openAdd() {
    setEditing(null);
    setForm(BLANK);
    setImageUrl(null);
    setImagePreview(null);
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? "", price: String(p.price), inventory: String(p.inventory), productType: p.productType, subsOnly: !!p.subsOnly });
    setImageUrl(p.imageUrl ?? null);
    setImagePreview(p.imageUrl ?? null);
    setOpen(true);
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    if (MOCK_MODE) return;
    setUploadingImage(true);
    try {
      const url = await uploadProductImage(file, creator.creatorId);
      if (url) setImageUrl(url);
    } catch {
      toast.error("Couldn't upload image");
    } finally {
      setUploadingImage(false);
    }
  }

  async function save() {
    if (!form.name || !form.price) return toast.error("Add a name and price");
    if (!editing && !stream) return toast.error("Create your channel stream first");

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateCreatorProduct(
          editing.id,
          { name: form.name, description: form.description, price: form.price, inventory: form.inventory, productType: form.productType, subsOnly: form.subsOnly, imageUrl },
          creator.creatorId,
        );
        setItems((cur) => cur.map((it) => (it.id === editing.id ? updated : it)));
        toast.success(`${updated.name} updated`);
      } else {
        const product = await createCreatorProduct(
          { playbackId: stream!.playbackId, name: form.name, description: form.description, price: form.price, productType: form.productType, inventory: form.inventory, subsOnly: form.subsOnly, imageUrl },
          creator.creatorId,
        );
        setItems((cur) => [product, ...cur]);
        toast.success(`${product.name} added to your store`);
      }
      setOpen(false);
    } catch (error) {
      toast.error(storeError(error));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(product: Product, status: Product["status"]) {
    setBusyId(product.id);
    try {
      const updated = await updateCreatorProductStatus(product.id, status, creator.creatorId);
      if (status === "archived") {
        setItems((current) => current.filter((item) => item.id !== product.id));
      } else {
        setItems((current) => current.map((item) => (item.id === product.id ? { ...item, ...updated, status } : item)));
      }
      toast.success(status === "archived" ? `${product.name} archived` : `${product.name} marked ${status.replace("_", " ")}`);
    } catch (error) {
      toast.error(storeError(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Store</h1>
          <div className="mt-1 text-[12px] text-muted">Products attached to @{creator.username}'s live channel.</div>
        </div>
        <Button size="pill" onClick={openAdd} disabled={!stream}>
          <Plus className="size-4" /> Add product
        </Button>
      </div>

      {items.length ? (
        <div className="flex flex-col gap-2.5">
          {items.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-raised p-3">
            <Tile seed={p.imageColor} src={p.imageUrl} size={52} radius={12} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{p.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                <span className="font-display font-bold text-white">${p.price}</span>
                <span>· {p.inventory} in stock</span>
                {p.subsOnly && <span className="rounded bg-blue/[0.18] px-1.5 py-px text-[8px] font-bold text-blue-soft">SUBS</span>}
                <StatusBadge status={p.status} />
              </div>
            </div>
            <button onClick={() => openEdit(p)} className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-ink-dim hover:text-white" aria-label={`Edit ${p.name}`}>
              <Pencil className="size-3.5" />
            </button>
            <ProductMenu product={p} busy={busyId === p.id} onStatus={setStatus} />
          </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[52vh] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
          <PackageCheck className="size-8 text-blue-light" />
          <div className="mt-3 text-sm font-semibold text-ink-dim">No products yet</div>
          <div className="mt-1 max-w-[310px] text-[12px] leading-relaxed text-faint">Add merch, digital files or paid spots, then pin one during a live stream.</div>
          <Button size="pill" className="mt-4" onClick={openAdd} disabled={!stream}>
            <Plus className="size-4" /> Add product
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={editing ? "Edit product" : "Add product"}>
        <div className="font-display text-[19px] font-semibold">{editing ? "Edit product" : "Add product"}</div>
        <div className="mt-4 flex items-start gap-3">
          <label className="relative flex size-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed border-white/16 bg-white/[0.05] text-faint hover:border-blue/60">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <ImagePlus className="size-6" />
            )}
            {uploadingImage && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin text-white" /></span>}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0] ?? null)} />
          </label>
          <div className="flex-1 text-[11px] leading-relaxed text-faint">
            <div className="text-[12px] font-semibold text-ink-dim">Product photo</div>
            Square works best. PNG/JPG/WEBP up to 5 MB. Optional — a color tile is used otherwise.
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Product name" className="h-12 rounded-[13px] border border-white/12 bg-white/[0.06] px-4 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none sm:col-span-2" />
          <input value={form.price} onChange={(e) => set({ price: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Price (USD)" inputMode="decimal" className="h-12 rounded-[13px] border border-white/12 bg-white/[0.06] px-4 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none" />
          <input value={form.inventory} onChange={(e) => set({ inventory: e.target.value.replace(/[^0-9]/g, "") })} placeholder="Inventory" inputMode="numeric" className="h-12 rounded-[13px] border border-white/12 bg-white/[0.06] px-4 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none" />
          <select value={form.productType} onChange={(e) => set({ productType: e.target.value as Product["productType"] })} className="h-12 rounded-[13px] border border-white/12 bg-[#151518] px-4 text-sm text-white focus:border-blue focus:outline-none sm:col-span-2">
            <option value="merch">Merch</option>
            <option value="physical">Physical</option>
            <option value="digital">Digital</option>
            <option value="ad">Paid spot</option>
          </select>
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Description" className="min-h-24 resize-none rounded-[13px] border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-faint focus:border-blue focus:outline-none sm:col-span-2" />
          <label className="flex h-12 items-center gap-2.5 rounded-[13px] border border-white/12 bg-white/[0.04] px-4 text-[12px] text-ink-dim sm:col-span-2">
            <input type="checkbox" checked={form.subsOnly} onChange={(e) => set({ subsOnly: e.target.checked })} className="size-4 accent-[#0091ff]" />
            Subscribers only
          </label>
        </div>
        <Button size="lg" className="mt-4 w-full" onClick={save} disabled={saving || uploadingImage}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {editing ? "Save changes" : "Add to store"}
        </Button>
      </Sheet>
    </>
  );
}

function ProductMenu({ product, busy, onStatus }: { product: Product; busy: boolean; onStatus: (product: Product, status: Product["status"]) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-ink-dim hover:text-white" aria-label={`Manage ${product.name}`}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className="z-50 min-w-40 rounded-xl border border-white/10 bg-elevated p-1.5 text-[12px] text-ink-dim shadow-[0_18px_50px_rgba(0,0,0,.45)]">
          <DropdownMenu.Item onSelect={() => onStatus(product, "active")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none hover:bg-white/[0.07] hover:text-white">
            <CheckCircle2 className="size-3.5" /> Active
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onStatus(product, "sold_out")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none hover:bg-white/[0.07] hover:text-white">
            <ShieldCheck className="size-3.5" /> Sold out
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onStatus(product, "archived")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-red-200 outline-none hover:bg-red-500/10 hover:text-white">
            <Archive className="size-3.5" /> Archive
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function StatusBadge({ status }: { status: Product["status"] }) {
  if (status === "active") return <span className="rounded bg-online/[0.16] px-1.5 py-px text-[8px] font-bold text-online">LIVE</span>;
  if (status === "sold_out") return <span className="rounded bg-white/[0.08] px-1.5 py-px text-[8px] font-bold text-ink-dim">SOLD</span>;
  return <span className="rounded bg-red-500/10 px-1.5 py-px text-[8px] font-bold text-red-200">ARCHIVED</span>;
}

function storeError(error: unknown) {
  if (!(error instanceof Error)) return "Store update failed";
  if (error.message === "stream_not_found") return "Create your channel stream first";
  if (error.message === "missing_product_name") return "Add a product name";
  if (error.message === "bad_price") return "Add a valid price";
  if (error.message === "missing_token" || error.message === "invalid_token") return "Sign in again to manage products";
  return "Store update failed";
}
