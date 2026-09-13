import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return "—";
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (price >= 1) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  if (price >= 0.01) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  }
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 8,
  });
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatUsd(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) {
    return Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (Math.abs(value) >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
