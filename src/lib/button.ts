import { cn } from './cn'

export type Variant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger'
export type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  // sprout: the thing to do next
  primary: 'bg-sprout text-on-sprout shadow-[inset_0_0_0_1px_rgb(20_24_19/0.12),0_1px_0_rgb(20_24_19/0.08)] hover-device:hover:bg-[#b8e62a]',
  ink: 'bg-ink text-paper hover-device:hover:bg-ink/85',
  outline: 'bg-raised/60 text-ink ring-1 ring-inset ring-line-2 hover-device:hover:bg-raised hover-device:hover:ring-ink-4',
  ghost: 'text-ink-2 hover-device:hover:text-ink hover-device:hover:bg-hover',
  danger: 'text-red ring-1 ring-inset ring-red/35 bg-raised/60 hover-device:hover:bg-red-soft',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[15px]',
}

export const buttonClass = (variant: Variant = 'outline', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-[background-color,box-shadow,color,scale] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&>svg]:shrink-0 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-300 hover-device:hover:[&>svg.lucide-arrow-right:last-child]:translate-x-0.5',
    variants[variant],
    sizes[size],
    className,
  )
