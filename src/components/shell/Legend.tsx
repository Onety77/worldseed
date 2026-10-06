import type { ReactNode } from 'react'

/** How to read the Field, as a map legend. */
export function Legend() {
  return (
    <div>
      <p className="label pb-2">Reading the Field</p>
      <dl className="grid gap-2 text-[12px] leading-snug text-ink-2">
        <Row icon={<path d="M7 17V4m0 .3 7 2.5-7 2.5M3.5 17h7" />}>A seed, in its 7-day Genesis era</Row>
        <Row icon={<path d="M2 17h16M4 17v-4h12v4M6.5 13V9.5h7V13M8.5 9.5V6h3v3.5" />}>Terraces: one per era passed; height follows readiness</Row>
        <Row icon={<path d="M5 15.5h3v-3H5zM10.5 15.5h4.5v-5h-4.5z" />}>Buildings: apps it has deployed</Row>
        <Row icon={<><circle cx="10" cy="10" r="7.5" strokeDasharray="2 2" /><circle cx="10" cy="10" r="3.5" /></>}>Ringed by water: its own chain</Row>
        <Row icon={<circle cx="10" cy="10" r="6" className="stroke-green" strokeWidth="2.2" />}>A governor just published proof</Row>
      </dl>
    </div>
  )
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <dt className="shrink-0">
        <svg viewBox="0 0 20 20" className="size-[18px] text-ink" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {icon}
        </svg>
        <span className="sr-only">Symbol</span>
      </dt>
      <dd className="pt-px">{children}</dd>
    </div>
  )
}
