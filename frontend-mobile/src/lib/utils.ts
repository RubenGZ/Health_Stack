import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatKg(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)} kg`
}

export function formatKcal(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${Math.round(value)} kcal`
}
