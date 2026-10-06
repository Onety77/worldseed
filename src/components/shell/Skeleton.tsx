import { cn } from '@/lib/cn'
import { Panel } from './Panel'

function Bar({ className }: { className?: string }) {
  return <span className={cn('skel block rounded-[6px]', className)} />
}

/** What a panel looks like for the moment its page is still on its way. */
export function PanelSkeleton() {
  return (
    <Panel label="Loading" rest={0.46}>
      <div aria-busy="true" aria-label="Loading" className="px-5 pt-5 pb-10 lg:px-6">
        <Bar className="h-3 w-20" />
        <Bar className="mt-4 h-7 w-3/5" />
        <Bar className="mt-3 h-3.5 w-11/12" />
        <Bar className="mt-2 h-3.5 w-4/5" />
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bar className="h-2.5 w-14" />
              <Bar className="mt-2 h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="mt-7 grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-[12px] p-3.5 ring-1 ring-line ring-inset">
              <Bar className="size-8 rounded-full" />
              <div className="flex-1">
                <Bar className="h-3.5 w-2/3" />
                <Bar className="mt-2 h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
