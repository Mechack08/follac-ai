"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-200/90 bg-white p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  href,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary:
      "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-300",
    secondary:
      "bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    ghost: "text-neutral-600 hover:bg-neutral-100",
  }[variant];
  const base = `inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`;

  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "gray" | "green" | "yellow" | "red" | "blue" | "indigo";
}) {
  const tones = {
    gray: "bg-neutral-100 text-neutral-700",
    green: "bg-green-50 text-green-800",
    yellow: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
    blue: "bg-sky-50 text-sky-800",
    indigo: "bg-brand-50 text-brand-700",
  }[tone];
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tones}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): "gray" | "green" | "yellow" | "red" | "blue" | "indigo" {
  switch (status) {
    case "completed":
    case "active":
    case "sent":
    case "done":
      return "green";
    case "processing":
    case "recording":
    case "trialing":
    case "in_progress":
      return "blue";
    case "bot_dispatched":
    case "scheduled":
    case "pending":
    case "open":
      return "indigo";
    case "past_due":
      return "yellow";
    case "failed":
    case "expired":
    case "canceled":
    case "cancelled":
      return "red";
    default:
      return "gray";
  }
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-500" />
    </div>
  );
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white py-16 text-center">
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">{subtitle}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Input({
  label,
  ...props
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>}
      <input
        {...props}
        className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 shadow-none focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group flex w-full items-center justify-between gap-4 text-left disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-neutral-900">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>}
        </span>
      )}
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-brand-500" : "bg-neutral-200"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
