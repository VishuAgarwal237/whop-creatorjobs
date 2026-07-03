import type { ReactNode } from "react";

/** Whop swirl mark. */
export function WhopMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--whop-orange) 0%, var(--whop-orange-strong) 100%)",
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        <path
          d="M3 7.5c2.4 0 3.4 1.2 4.6 3.6C8.9 13.8 9.9 15 12.3 15M9 7.5c2.4 0 3.4 1.2 4.6 3.6C15 13.8 16 15 18.4 15c2.4 0 3.6-1.4 3.6-3.6"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Container({
  children,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const w = size === "lg" ? "max-w-5xl" : size === "sm" ? "max-w-md" : "max-w-2xl";
  return <div className={`mx-auto w-full ${w} px-4 py-8 sm:px-6 ${className}`}>{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Button className helper — apply to <button> or <Link>. */
export function btn(variant: "primary" | "dark" | "outline" | "ghost" = "primary", extra = "") {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "text-white bg-[var(--whop-blue)] hover:bg-[var(--whop-blue-hover)]",
    dark: "text-white bg-foreground hover:bg-black",
    outline: "border border-border bg-white text-foreground hover:bg-surface",
    ghost: "text-muted hover:text-foreground",
  };
  return `${base} ${variants[variant]} ${extra}`;
}

export const inputCls =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--whop-blue)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--whop-blue)_25%,transparent)]";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: ReactNode }) {
  const map = {
    info: "bg-blue-50 text-blue-800",
    error: "bg-red-50 text-red-700",
    success: "bg-green-50 text-green-700",
  } as const;
  return <p className={`rounded-lg px-3 py-2 text-sm ${map[kind]}`}>{children}</p>;
}

const STATUS_STYLES: Record<string, string> = {
  // orders
  PAID: "bg-green-100 text-green-800",
  FULFILLED: "bg-green-100 text-green-800",
  SETTLED: "bg-green-100 text-green-800",
  PROCESSING: "bg-amber-100 text-amber-800",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  DRAFT: "bg-gray-100 text-gray-700",
  FAILED: "bg-red-100 text-red-700",
  REFUNDED: "bg-gray-200 text-gray-800",
  DISPUTED: "bg-red-100 text-red-700",
  // listings / kyc / payouts
  active: "bg-green-100 text-green-800",
  approved: "bg-green-100 text-green-800",
  completed: "bg-green-100 text-green-800",
  stubbed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-200 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-700",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {label ?? status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

/** Shared table cell classes. */
export const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const td = "px-3 py-2.5 text-sm";
