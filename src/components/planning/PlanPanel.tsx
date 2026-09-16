import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  Clock,
  Footprints,
  MapPin,
  Search,
  TrainFront,
} from 'lucide-react'
import type { PlanConclusion, TripPlan, WindowScene } from '@/types'
import { useTransitStore } from '@/store/useTransitStore'
import { useSceneStore } from '@/store/useSceneStore'
import { formatMinutes, parseTimeToMinutes, planTrip } from '@/services/planner'
import { attachScenes, scenesAlongLeg } from '@/services/attachment'
import { formatTimestamp, getWeatherIcon } from '@/utils/sceneHelpers'

function nowTimeText(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const CONCLUSION_TEXT: Record<string, { title: string; detail?: string }> = {
  'empty-network': { title: '线网为空', detail: '请先在「站点与线路」中维护站点和线路' },
  'same-station': { title: '起点与终点相同', detail: '无需乘车' },
  'station-unknown': { title: '起点或终点不在线网中', detail: '请重新选择站点' },
  unreachable: { title: '不可达', detail: '线网中从起点到终点没有通路' },
  'service-over': { title: '末班已过', detail: '今日已无可用班次完成此行程' },
}

function LegScenes({ scenes }: { scenes: WindowScene[] }) {
  if (scenes.length === 0) return null
  return (
    <div className="mt-2 space-y-1.5 border-t border-teal-800/60 pt-2">
      <p className="text-[10px] text-mist-500">沿途已有记录 {scenes.length} 条</p>
      {scenes.map((scene) => (
        <div key={scene.id} className="flex items-center gap-2 text-xs text-mist-400">
          {getWeatherIcon(scene.weather)}
          <span className="text-mist-300">{scene.segment}</span>
          <span className="text-teal-700">·</span>
          <span>{formatTimestamp(scene.timestamp)}</span>
          {scene.note && <span className="truncate text-mist-500">「{scene.note}」</span>}
        </div>
      ))}
    </div>
  )
}

function PlanView({
  plan,
  title,
  scenes,
  attachments,
  stationName,
  defaultOpen,
}: {
  plan: TripPlan
  title: string
  scenes: WindowScene[]
  attachments: Map<string, import('@/types').Attachment>
  stationName: (id: string) => string
  defaultOpen: boolean
}) {
  return (
    <div className="rounded-xl border border-teal-800 bg-teal-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-serif text-sm text-dusk-400">{title}</span>
        <span className="flex items-center gap-1 text-sm text-mist-100">
          <Clock className="h-3.5 w-3.5 text-dusk-400" />
          {formatMinutes(plan.departTime)} → {formatMinutes(plan.arriveTime)}
        </span>
        <span className="text-xs text-mist-400">总时长 {plan.totalMinutes} 分钟</span>
        <span className="text-xs text-mist-400">换乘 {plan.transferCount} 次</span>
        <span className="text-xs text-mist-400">共 {plan.totalStops} 站</span>
      </div>

      <div className="space-y-0">
        {plan.legs.map((leg, i) => {
          const transfer = i > 0 ? plan.transfers[i - 1] : null
          const legScenes = defaultOpen
            ? scenesAlongLeg(leg.stationIds, leg.routeId, scenes, attachments)
            : []
          return (
            <div key={`${leg.routeId}-${leg.boardStationId}-${leg.boardTime}`}>
              {transfer && (
                <div className="ml-4 flex items-center gap-2 border-l-2 border-dashed border-teal-700 py-2 pl-4 text-xs text-mist-400">
                  <Footprints className="h-3.5 w-3.5 text-dusk-300" />
                  <span>
                    在「{stationName(transfer.atStationId)}」换乘:步行 {transfer.walkMinutes} 分钟
                    + 等车 {transfer.waitMinutes} 分钟({transfer.fromRouteName} →{' '}
                    {transfer.toRouteName})
                  </span>
                </div>
              )}
              <div className="rounded-lg bg-teal-850/70 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Bus className="h-4 w-4 text-dusk-400" />
                  <span className="font-medium text-mist-100">{leg.routeName}</span>
                  <span className="rounded bg-teal-800/70 px-1.5 py-0.5 text-[10px] text-mist-300">
                    {leg.directionLabel}
                  </span>
                  <span className="text-xs text-mist-500">{leg.stops} 站</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist-300">
                  <span>
                    {stationName(leg.boardStationId)} {formatMinutes(leg.boardTime)} 上车
                  </span>
                  <ArrowRight className="h-3 w-3 text-teal-700" />
                  <span>
                    {stationName(leg.alightStationId)} {formatMinutes(leg.alightTime)} 下车
                  </span>
                </div>
                {defaultOpen && <LegScenes scenes={legScenes} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PlanPanel() {
  const network = useTransitStore((s) => s.network)
  const scenes = useSceneStore((s) => s.scenes)

  const [originId, setOriginId] = useState('')
  const [destId, setDestId] = useState('')
  const [timeText, setTimeText] = useState(nowTimeText)
  const [inputError, setInputError] = useState('')
  const [result, setResult] = useState<PlanConclusion | null>(null)

  const sortedStations = useMemo(
    () => [...network.stations].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    [network.stations],
  )
  const stationNameMap = useMemo(() => {
    const map = new Map(network.stations.map((s) => [s.id, s.name]))
    return (id: string) => map.get(id) ?? '?'
  }, [network.stations])
  const attachments = useMemo(() => attachScenes(scenes, network), [scenes, network])

  const handlePlan = () => {
    const minutes = parseTimeToMinutes(timeText)
    if (minutes === null) {
      setInputError('出发时刻格式应为 HH:MM,如 08:30')
      setResult(null)
      return
    }
    if (!originId || !destId) {
      setInputError('请选择起点和终点')
      setResult(null)
      return
    }
    setInputError('')
    setResult(planTrip(network, originId, destId, minutes))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-800 bg-teal-900/50 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-mist-300">
              <MapPin className="h-3 w-3" />起点
            </label>
            <select
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
              className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
            >
              <option value="">选择站点</option>
              {sortedStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-mist-300">
              <MapPin className="h-3 w-3" />终点
            </label>
            <select
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
              className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
            >
              <option value="">选择站点</option>
              {sortedStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-mist-300">
              <Clock className="h-3 w-3" />出发时刻
            </label>
            <input
              type="time"
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
            />
          </div>
        </div>
        {inputError && (
          <p className="mt-2 flex items-center gap-1 text-xs text-red-300">
            <AlertTriangle className="h-3 w-3" />
            {inputError}
          </p>
        )}
        <button
          onClick={handlePlan}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-dusk-400 py-2.5 text-sm font-medium text-teal-950 transition active:scale-[0.98]"
        >
          <Search className="h-4 w-4" />规划最早到达
        </button>
      </div>

      {result && result.kind !== 'ok' && (
        <div className="rounded-xl border border-dusk-400/30 bg-dusk-400/10 p-4">
          <div className="flex items-center gap-2 text-dusk-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-serif">{CONCLUSION_TEXT[result.kind]?.title}</span>
          </div>
          {result.kind === 'duplicate-stations' && (
            <p className="mt-1 text-xs text-mist-400">
              存在同名站:{result.names.join('、')}。站点无法唯一确定,请先在「站点与线路」中处理。
            </p>
          )}
          {result.kind === 'invalid-route' && (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-mist-400">
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {CONCLUSION_TEXT[result.kind]?.detail && (
            <p className="mt-1 text-xs text-mist-400">{CONCLUSION_TEXT[result.kind].detail}</p>
          )}
        </div>
      )}

      {result && result.kind === 'ok' && (
        <div className="space-y-3">
          <PlanView
            plan={result.best}
            title="最早到达"
            scenes={scenes}
            attachments={attachments}
            stationName={stationNameMap}
            defaultOpen
          />
          {result.alternatives.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1 text-xs text-mist-500">
                <TrainFront className="h-3.5 w-3.5" />
                到达时刻并列的方案(按换乘少、站数少、线路名定序)
              </p>
              {result.alternatives.map((plan, i) => (
                <PlanView
                  key={`${plan.routeKey}-${i}`}
                  plan={plan}
                  title={`并列方案 ${i + 2}:${plan.legs.map((l) => l.routeName).join(' → ')}`}
                  scenes={scenes}
                  attachments={attachments}
                  stationName={stationNameMap}
                  defaultOpen={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
