"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "golive" | "live" | "white" | "destructive";
type Size = "sm" | "md" | "lg" | "pill";

// Package 3 spec: pill geometry, 44px min targets, beam is the single
// brand-action color, hover = beam-deep (fill shift, not opacity),
// active = scale 0.97 over 150ms expo, focus = 2px beam ring always visible.
const base =
  "inline-flex items-center justify-center gap-2 font-semibold cursor-pointer select-none " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(.22,1,.36,1)] " +
  "active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beam focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Elevation on dark is a lighter surface + a line, never a shadow — so no
// variant carries a box-shadow (framework §6 / anti-pattern list).
const variants: Record<Variant, string> = {
  primary: "bg-beam text-canvas hover:bg-beam-deep",
  secondary: "bg-transparent border border-white/16 text-ink-soft hover:bg-white/[0.05] hover:border-white/30",
  ghost: "bg-transparent text-muted hover:bg-white/[0.06] hover:text-ink-soft",
  // Tier 1: the creator's own action. Never rendered beside a beam button in
  // the same component — the accent owns the page, the beam owns the platform.
  accent: "bg-accent text-on-accent hover:brightness-95",
  // The one red button in the product — pressing it IS going live (F5).
  golive: "bg-live text-white hover:bg-[#dc3535]",
  live: "bg-live text-white hover:bg-[#dc3535]",
  white: "bg-white text-canvas hover:bg-white/90",
  // Destructive is error-red, never live-red.
  destructive: "bg-transparent border border-error/40 text-error hover:bg-error/10 hover:border-error/60",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px] rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-[52px] px-6 text-[14.5px] rounded-full",
  pill: "h-[46px] px-6 text-sm rounded-full",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
    );
  },
);
Button.displayName = "Button";
