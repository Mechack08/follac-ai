import type { Platform } from "@follac/shared";

interface ContextBadgeProps {
  platform: Platform;
}

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string }> = {
  gmail: { label: "Gmail", color: "bg-red-600" },
  "google-docs": { label: "Docs", color: "bg-blue-600" },
  linkedin: { label: "LinkedIn", color: "bg-blue-800" },
  unknown: { label: "Unknown", color: "bg-slate-600" },
};

export function ContextBadge({ platform }: ContextBadgeProps) {
  const cfg = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.unknown;
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white ${cfg.color}`}
    >
      {cfg.label}
    </span>
  );
}
