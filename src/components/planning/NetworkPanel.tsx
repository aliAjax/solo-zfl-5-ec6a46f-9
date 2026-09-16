import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import type { RouteFormData, TransitRoute } from '@/types'
import { useTransitStore } from '@/store/useTransitStore'

const emptyForm: RouteFormData = {
  name: '',
  stationIds: [],
  isLoop: false,
  isOneWay: false,
  intervalMinutes: '15',
  firstService: '06:00',
  lastService: '22:00',
  travelMinutesPerStop: '3',
}

function routeToForm(route: TransitRoute): RouteFormData {
  return {
    name: route.name,
    stationIds: [...route.stationIds],
    isLoop: route.isLoop,
    isOneWay: route.isOneWay,
    intervalMinutes: String(route.intervalMinutes),
    firstService: route.firstService,
    lastService: route.lastService,
    travelMinutesPerStop: String(route.travelMinutesPerStop),
  }
}

/* ---------- 站点维护 ---------- */

function StationSection() {
  const network = useTransitStore((s) => s.network)
  const addStation = useTransitStore((s) => s.addStation)
  const renameStation = useTransitStore((s) => s.renameStation)
  const deleteStation = useTransitStore((s) => s.deleteStation)

  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const sorted = useMemo(
    () => [...network.stations].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    [network.stations],
  )
  const usedCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const route of network.routes) {
      for (const id of route.stationIds) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [network.routes])

  const handleAdd = () => {
    const err = addStation(newName)
    setError(err ?? '')
    if (!err) setNewName('')
  }

  const handleRename = (id: string) => {
    const err = renameStation(id, editingName)
    setError(err ?? '')
    if (!err) setEditingId(null)
  }

  const handleDelete = (id: string) => {
    setError(deleteStation(id) ?? '')
  }

  return (
    <section className="rounded-xl border border-teal-800 bg-teal-900/50 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-serif text-dusk-400">
        <MapPin className="h-4 w-4" />站点({network.stations.length})
      </h3>
      <div className="mb-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="新站点名"
          className="flex-1 rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
        />
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-xl bg-dusk-400 px-3 py-2 text-sm font-medium text-teal-950 transition active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />添加
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
      {sorted.length === 0 ? (
        <p className="py-4 text-center text-xs text-mist-500">还没有站点,先添加几个吧</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((station) => (
            <li
              key={station.id}
              className="flex items-center gap-2 rounded-lg bg-teal-850/70 px-3 py-2 text-sm"
            >
              {editingId === station.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(station.id)}
                    className="flex-1 rounded-lg bg-teal-900 px-2 py-1 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
                    autoFocus
                  />
                  <button
                    onClick={() => handleRename(station.id)}
                    className="text-dusk-400 hover:text-dusk-300"
                    title="保存"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-mist-500 hover:text-mist-300"
                    title="取消"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-mist-100">{station.name}</span>
                  <span className="text-[10px] text-mist-500">
                    {usedCount.get(station.id) ?? 0} 条线路使用
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(station.id)
                      setEditingName(station.name)
                      setError('')
                    }}
                    className="text-mist-500 hover:text-dusk-300"
                    title="重命名"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(station.id)}
                    className="text-mist-500 hover:text-red-300"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------- 线路编辑表单 ---------- */

function RouteForm({
  initial,
  editingId,
  onDone,
}: {
  initial: RouteFormData
  editingId: string | null
  onDone: () => void
}) {
  const network = useTransitStore((s) => s.network)
  const saveRoute = useTransitStore((s) => s.saveRoute)
  const [form, setForm] = useState<RouteFormData>(initial)
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')

  const stationName = (id: string) => network.stations.find((s) => s.id === id)?.name ?? '?'
  const available = network.stations.filter((s) => !form.stationIds.includes(s.id))

  const update = <K extends keyof RouteFormData>(key: K, val: RouteFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const move = (index: number, delta: number) => {
    const next = [...form.stationIds]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    update('stationIds', next)
  }

  const handleSave = () => {
    const err = saveRoute(form, editingId)
    setError(err ?? '')
    if (!err) onDone()
  }

  return (
    <div className="space-y-3 rounded-xl border border-dusk-400/30 bg-teal-900/70 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-mist-300">线路名</label>
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="如 27路"
            className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-mist-300">发车间隔(分钟)</label>
          <input
            type="number"
            min={1}
            value={form.intervalMinutes}
            onChange={(e) => update('intervalMinutes', e.target.value)}
            className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-mist-300">站间行驶(分钟)</label>
          <input
            type="number"
            min={1}
            value={form.travelMinutesPerStop}
            onChange={(e) => update('travelMinutesPerStop', e.target.value)}
            className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-mist-300">首班</label>
          <input
            type="time"
            value={form.firstService}
            onChange={(e) => update('firstService', e.target.value)}
            className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-mist-300">末班</label>
          <input
            type="time"
            value={form.lastService}
            onChange={(e) => update('lastService', e.target.value)}
            className="w-full rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
          />
        </div>
      </div>

      <div className="flex gap-2">
        {(
          [
            ['isLoop', '环线'],
            ['isOneWay', '单向'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => update(key, !form[key])}
            className={`flex-1 rounded-xl border py-2 text-sm transition ${
              form[key]
                ? 'border-dusk-400 bg-dusk-400/20 text-dusk-400'
                : 'border-transparent bg-teal-850 text-mist-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs text-mist-300">站点顺序(按行驶方向)</label>
        {form.stationIds.length > 0 && (
          <ul className="mb-2 space-y-1">
            {form.stationIds.map((id, index) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg bg-teal-850/70 px-3 py-1.5 text-sm"
              >
                <span className="w-5 text-center text-[10px] text-mist-500">{index + 1}</span>
                <span className="flex-1 text-mist-100">{stationName(id)}</span>
                <button onClick={() => move(index, -1)} className="text-mist-500 hover:text-mist-200" title="上移">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(index, 1)} className="text-mist-500 hover:text-mist-200" title="下移">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => update('stationIds', form.stationIds.filter((s) => s !== id))}
                  className="text-mist-500 hover:text-red-300"
                  title="移除"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="flex-1 rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-100 outline-none focus:ring-1 focus:ring-dusk-400"
          >
            <option value="">选择要追加的站点</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!pick) return
              update('stationIds', [...form.stationIds, pick])
              setPick('')
            }}
            className="flex items-center gap-1 rounded-xl bg-teal-850 px-3 py-2 text-sm text-mist-200 transition hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />追加
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 rounded-xl bg-dusk-400 py-2.5 text-sm font-medium text-teal-950 transition active:scale-[0.98]"
        >
          {editingId ? '保存修改' : '创建线路'}
        </button>
        <button
          onClick={onDone}
          className="rounded-xl bg-teal-850 px-4 py-2.5 text-sm text-mist-300 transition hover:bg-teal-800"
        >
          取消
        </button>
      </div>
    </div>
  )
}

/* ---------- 线路维护 ---------- */

function RouteSection() {
  const network = useTransitStore((s) => s.network)
  const deleteRoute = useTransitStore((s) => s.deleteRoute)
  const [formState, setFormState] = useState<{ editingId: string | null; initial: RouteFormData } | null>(null)

  const stationName = (id: string) => network.stations.find((s) => s.id === id)?.name ?? '?'
  const sortedRoutes = useMemo(
    () => [...network.routes].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    [network.routes],
  )

  return (
    <section className="rounded-xl border border-teal-800 bg-teal-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-serif text-dusk-400">
          <Repeat className="h-4 w-4" />线路({network.routes.length})
        </h3>
        {!formState && (
          <button
            onClick={() => setFormState({ editingId: null, initial: emptyForm })}
            disabled={network.stations.length < 2}
            className="flex items-center gap-1 rounded-xl bg-dusk-400 px-3 py-1.5 text-xs font-medium text-teal-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            title={network.stations.length < 2 ? '至少需要 2 个站点' : ''}
          >
            <Plus className="h-3.5 w-3.5" />新建线路
          </button>
        )}
      </div>

      {formState && (
        <div className="mb-3">
          <RouteForm
            key={formState.editingId ?? 'new'}
            initial={formState.initial}
            editingId={formState.editingId}
            onDone={() => setFormState(null)}
          />
        </div>
      )}

      {sortedRoutes.length === 0 && !formState ? (
        <p className="py-4 text-center text-xs text-mist-500">
          {network.stations.length < 2 ? '先添加至少 2 个站点,才能建线路' : '还没有线路'}
        </p>
      ) : (
        <ul className="space-y-2">
          {sortedRoutes.map((route) => (
            <li key={route.id} className="rounded-lg bg-teal-850/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-mist-100">{route.name}</span>
                {route.isLoop && (
                  <span className="rounded bg-dusk-400/15 px-1.5 py-0.5 text-[10px] text-dusk-300">环线</span>
                )}
                {route.isOneWay && (
                  <span className="rounded bg-dusk-400/15 px-1.5 py-0.5 text-[10px] text-dusk-300">单向</span>
                )}
                <span className="text-[10px] text-mist-500">
                  间隔 {route.intervalMinutes} 分钟 · {route.firstService}–{route.lastService} · 站间{' '}
                  {route.travelMinutesPerStop} 分钟
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => setFormState({ editingId: route.id, initial: routeToForm(route) })}
                  className="text-mist-500 hover:text-dusk-300"
                  title="编辑"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteRoute(route.id)}
                  className="text-mist-500 hover:text-red-300"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-mist-400">
                {route.stationIds.map((id, i) => (
                  <span key={`${id}-${i}`} className="flex items-center gap-1">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-teal-700" />}
                    <span>{stationName(id)}</span>
                  </span>
                ))}
                {route.isLoop && route.stationIds.length > 0 && (
                  <span className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-teal-700" />
                    <span className="text-mist-500">{stationName(route.stationIds[0])}(回到起点)</span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function NetworkPanel() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StationSection />
      <RouteSection />
    </div>
  )
}
