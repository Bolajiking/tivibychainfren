"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "golive" | "live" | "white";
type Size = "sm" | "md" | "lg" | "pill";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold cursor-pointer select-none " +
  "transition-[opacity,transform] duration-150 ease-[cubic-bezier(.22,1,.36,1)] " +
  "active:scale-[0.97] hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const variants: Record<Variant, string> = {
  primary: "bg-blue text-white glow-blue",
  secondary: "bg-white/10 border border-white/20 text-white backdrop-blur",
  ghost: "bg-white/[0.06] border border-white/10 text-muted hover:text-white",
  golive: "golive-gradient text-white shadow-[0_10px_28px_rgba(0,145,255,.3)]",
  live: "bg-live text-white shadow-[0_8px_24px_rgba(239,68,68,.35)]",
  white: "bg-white text-canvas shadow-[0_8px_24px_rgba(255,255,255,.12)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px] rounded-xl",
  md: "h-11 px-5 text-sm rounded-[13px]",
  lg: "h-[52px] px-6 text-[14.5px] rounded-[15px]",
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
