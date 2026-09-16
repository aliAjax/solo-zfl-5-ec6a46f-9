import { useEffect, useState } from 'react'
import { Compass, Link2, Route, Search } from 'lucide-react'
import { useSceneStore } from '@/store/useSceneStore'
import { useTransitStore } from '@/store/useTransitStore'
import PlanPanel from '@/components/planning/PlanPanel'
import NetworkPanel from '@/components/planning/NetworkPanel'
import AttachmentPanel from '@/components/planning/AttachmentPanel'

const TABS = [
  { key: 'plan', label: '路线规划', icon: Search },
  { key: 'network', label: '站点与线路', icon: Route },
  { key: 'attach', label: '记录挂接', icon: Link2 },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function PlanningPage() {
  const [tab, setTab] = useState<TabKey>('plan')
  const loadAll = useSceneStore((s) => s.loadAll)
  const reload = useTransitStore((s) => s.reload)

  useEffect(() => {
    loadAll()
    reload()
  }, [loadAll, reload])

  return (
    <div className="min-h-screen bg-teal-950 p-4 pb-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-2">
          <Compass className="h-6 w-6 text-dusk-400" />
          <h1 className="font-serif text-2xl text-mist-100">采风路线规划台</h1>
        </div>

        <div className="mb-4 flex gap-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm transition ${
                tab === key
                  ? 'border-dusk-400 bg-dusk-400/20 text-dusk-400'
                  : 'border-transparent bg-teal-900/60 text-mist-300 hover:bg-teal-850'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'plan' && <PlanPanel />}
        {tab === 'network' && <NetworkPanel />}
        {tab === 'attach' && <AttachmentPanel />}
      </div>
    </div>
  )
}
