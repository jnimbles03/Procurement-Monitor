import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | number) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

export function calculateRebidStatus(start?: string | null, end?: string | null): "UPCOMING" | "ACTIVE" | "CLOSED" {
  // Using the requested baseline date of 2026-03-24 for the demo
  const today = new Date("2026-03-24").getTime();
  
  if (!start && !end) return "UPCOMING";
  
  const startTime = start ? new Date(start).getTime() : 0;
  const endTime = end ? new Date(end).getTime() : Infinity;

  if (today < startTime) return "UPCOMING";
  if (today > endTime) return "CLOSED";
  return "ACTIVE";
}
