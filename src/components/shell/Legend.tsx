import type { ReactNode } from 'react'
import { useInSpace } from '@/field/Field'

/** How to read the Field, as a map legend: the land, or the planets when you're out in space. */
export function Legend() {
  const space = useInSpace()
  if (space)
    return (
      <div>
        <p className="label pb-2">Reading the planets</p>
        <dl className="grid gap-2 text-[12px] leading-snug text-ink-2">
          <Row icon={<><circle cx="10" cy="10" r="5" /><path d="M2.5 13.5c3-3.2 12-6.6 15-4.6" /></>}>A planet: a world with its own chain; its size follows the people it keeps</Row>
          <Row icon={<><circle cx="10" cy="10" r="3.2" /><ellipse cx="10" cy="10" rx="8" ry="3" /></>}>Rings: a treasury past $2M</Row>
          <Row icon={<><circle cx="8" cy="11" r="4.5" /><circle cx="16" cy="5" r="1.6" /></>}>Moons: its revenue</Row>
          <Row icon={<><circle cx="10" cy="10" r="6.5" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13" fill="currentColor" fillOpacity=".25" stroke="none" /><circle cx="12.5" cy="9" r=".6" fill="currentColor" /><circle cx="13.5" cy="12" r=".6" fill="currentColor" /></>}>Lights on its night side: its holders</Row>
          <Row icon={<path d="M3 16c3-8 9-11 14-12" strokeDasharray="2 2" className="stroke-green" strokeWidth="1.6" />}>A thread back to the launch site it lifted off from</Row>
        </dl>
      </div>
    )
  return (
    <div>
      <p className="label pb-2">Reading the Field</p>
      <dl className="grid gap-2 text-[12px] leading-snug text-ink-2">
        <Row icon={<path d="M7 17V4m0 .3 7 2.5-7 2.5M3.5 17h7" />}>A seed, in its 7-day Genesis era</Row>
        <Row icon={<path d="M2 17h16M4 17v-4h12v4M6.5 13V9.5h7V13M8.5 9.5V6h3v3.5" />}>Terraces: one per era passed; height follows readiness</Row>
        <Row icon={<path d="M5 15.5h3v-3H5zM10.5 15.5h4.5v-5h-4.5z" />}>Buildings: apps it has deployed</Row>
        <Row icon={<path d="M3.5 16.5h13M6 16.5c0-2.2 1.8-3 4-3s4 .8 4 3M10 13.5V2.5" strokeDasharray="0" />}>Launch site: it left to become a planet</Row>
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
