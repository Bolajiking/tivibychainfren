"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Creator } from "@/lib/types";

/** Client identity and balance persisted across local sessions. */
interface SessionUser {
  walletAddress: string;
  walletAddresses: string[];
  displayName: string;
  balanceUsd: number;
}

/** Lightweight channel reference for the nav (no full creator fetch needed). */
interface ChannelSummary {
  creatorId: string;
  username: string;
  displayName: string;
  avatarColor?: string;
  avatarUrl?: string | null;
}

/** Which surface the signed-in user is currently driving. */
type Persona = "fan" | "owner";

/** A money moment recorded for the wallet ledger. `amountUsd` is signed: + in, − out. */
export type WalletTxKind = "fund" | "cashout" | "tip" | "unlock" | "subscribe" | "buy";
export interface WalletTx {
  id: string;
  kind: WalletTxKind;
  label: string;
  sub: string;
  amountUsd: number;
  txHash?: string;
  createdAt: string;
}

const MAX_TX = 60;

interface SessionState {
  user: SessionUser | null;
  /** creatorIds the user follows / subscribes to */
  subscribedTo: string[];
  /** channel summaries for subscriptions, for the nav rail */
  subscriptions: ChannelSummary[];
  /** optimistic unlock keys (stream_access_<id> / creator_access_<id>) */
  unlocked: string[];
  /** creator profile owned by the current signed-in wallet (null = not a creator) */
  creator: Creator | null;
  /** fan = browsing; owner = managing own channel. Only meaningful when creator != null. */
  persona: Persona;
  /** current wallet sheet view */
  wallet: "idle" | "home" | "add" | "cashout";
  /** desktop sidebar collapsed (icon-only) vs expanded — persisted across sessions */
  navCollapsed: boolean;
  /** the user's real money-moment ledger (newest first), persisted */
  transactions: WalletTx[];

  addTransaction: (tx: Omit<WalletTx, "id" | "createdAt"> & { createdAt?: string }) => void;

  toggleNav: () => void;
  setNavCollapsed: (collapsed: boolean) => void;

  openWallet: () => void;
  closeWallet: () => void;
  setWalletView: (view: "home" | "add" | "cashout") => void;

  login: (displayName?: string) => void;
  /** set identity from a real provider (Privy bridge) */
  setUser: (user: SessionUser) => void;
  setCreator: (creator: Creator | null) => void;
  setPersona: (persona: Persona) => void;
  /** refresh the USD-denominated balance */
  setBalance: (usd: number) => void;
  logout: () => void;
  addFunds: (amountUsd: number) => void;
  /** returns true if the balance covered it */
  spend: (amountUsd: number) => boolean;
  markUnlocked: (key: string) => void;
  isUnlocked: (key: string) => boolean;
  subscribe: (creatorId: string, summary?: ChannelSummary) => void;
  isSubscribed: (creatorId: string) => boolean;
}

const demoAddress = "0xfa9d000000000000000000000000000000000001";

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      user: null,
      subscribedTo: [],
      subscriptions: [],
      unlocked: [],
      creator: null,
      persona: "fan",
      wallet: "idle",
      navCollapsed: false,
      transactions: [],

      addTransaction: (tx) =>
        set((s) => ({
          transactions: [
            { id: `tx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, createdAt: new Date().toISOString(), ...tx },
            ...s.transactions,
          ].slice(0, MAX_TX),
        })),

      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setNavCollapsed: (collapsed) => set({ navCollapsed: collapsed }),

      openWallet: () => set({ wallet: "home" }),
      closeWallet: () => set({ wallet: "idle" }),
      setWalletView: (view) => set({ wallet: view }),

      login: (displayName = "You") =>
        set({
          user: {
            walletAddress: demoAddress,
            walletAddresses: [demoAddress],
            displayName,
            balanceUsd: 24,
          },
        }),

      setUser: (user) =>
        set((s) => {
          const current = s.user?.walletAddress.toLowerCase();
          const next = user.walletAddress.toLowerCase();
          if (current && current !== next) {
            return {
              user,
              subscribedTo: [],
              subscriptions: [],
              unlocked: [],
              creator: null,
              persona: "fan",
              transactions: [],
            };
          }
          return { user };
        }),
      setCreator: (creator) => set({ creator }),
      // Owner persona only holds while a creator profile exists; otherwise force fan.
      setPersona: (persona) => set((s) => ({ persona: persona === "owner" && !s.creator ? "fan" : persona })),

      setBalance: (usd) =>
        set((s) => (s.user ? { user: { ...s.user, balanceUsd: usd } } : s)),

      // Full reset on sign-out — no identity, persona, follow, or money history leaks to the next user.
      logout: () => set({ user: null, subscribedTo: [], subscriptions: [], unlocked: [], creator: null, persona: "fan", transactions: [] }),

      addFunds: (amountUsd) =>
        set((s) => (s.user ? { user: { ...s.user, balanceUsd: s.user.balanceUsd + amountUsd } } : s)),

      spend: (amountUsd) => {
        const u = get().user;
        if (!u || u.balanceUsd < amountUsd) return false;
        set({ user: { ...u, balanceUsd: u.balanceUsd - amountUsd } });
        return true;
      },

      markUnlocked: (key) => set((s) => ({ unlocked: [...new Set([...s.unlocked, key])] })),
      isUnlocked: (key) => get().unlocked.includes(key),

      subscribe: (creatorId, summary) =>
        set((s) => {
          const id = creatorId.toLowerCase();
          const subscriptions =
            summary && !s.subscriptions.some((c) => c.creatorId.toLowerCase() === id)
              ? [...s.subscriptions, { ...summary, creatorId: id }]
              : s.subscriptions;
          return { subscribedTo: [...new Set([...s.subscribedTo, id])], subscriptions };
        }),
      isSubscribed: (creatorId) => get().subscribedTo.includes(creatorId.toLowerCase()),
    }),
    {
      name: "tvinbio-session",
      // The wallet sheet is transient UI — never persist it open across reloads.
      partialize: (s) => ({
        user: s.user,
        subscribedTo: s.subscribedTo,
        subscriptions: s.subscriptions,
        unlocked: s.unlocked,
        creator: s.creator,
        persona: s.persona,
        navCollapsed: s.navCollapsed,
        transactions: s.transactions,
      }),
    },
  ),
);
