import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom type sizes from @theme; otherwise it reads
// `text-h2` as a colour and drops it whenever a `text-ink` class follows.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['display', 'h1', 'h2'] }] } },
})

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
