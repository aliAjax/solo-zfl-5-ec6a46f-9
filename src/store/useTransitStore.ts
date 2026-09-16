import { create } from 'zustand'
import type { RouteFormData, TransitNetwork, TransitRoute } from '@/types'
import {
  getNetwork,
  addStation as storageAddStation,
  renameStation as storageRenameStation,
  removeStation as storageRemoveStation,
  saveRoute as storageSaveRoute,
  removeRoute as storageRemoveRoute,
} from '@/services/transitStorage'
import { parseTimeToMinutes } from '@/services/planner'

interface TransitState {
  network: TransitNetwork

  reload: () => void
  addStation: (name: string) => string | null
  renameStation: (id: string, name: string) => string | null
  deleteStation: (id: string) => string | null
  saveRoute: (form: RouteFormData, editingId: string | null) => string | null
  deleteRoute: (id: string) => void
}

/** 校验并组装线路,返回错误信息或 null */
function buildRoute(form: RouteFormData, editingId: string | null): { route?: TransitRoute; error?: string } {
  const name = form.name.trim()
  if (!name) return { error: '线路名不能为空' }
  if (form.stationIds.length < 2) return { error: '线路至少需要 2 个站点' }
  const dup = form.stationIds.filter((id, i) => form.stationIds.indexOf(id) !== i)
  if (dup.length > 0) return { error: '线路内站点重复' }

  const interval = Number(form.intervalMinutes)
  if (!Number.isInteger(interval) || interval < 1) {
    return { error: '发车间隔非法:应为不小于 1 的整数分钟' }
  }
  const travel = Number(form.travelMinutesPerStop)
  if (!Number.isInteger(travel) || travel < 1) {
    return { error: '站间行驶时间非法:应为不小于 1 的整数分钟' }
  }
  const first = parseTimeToMinutes(form.firstService)
  const last = parseTimeToMinutes(form.lastService)
  if (first === null || last === null) return { error: '首末班时间格式应为 HH:MM' }
  if (first >= last) return { error: '首班时间必须早于末班时间' }

  return {
    route: {
      id: editingId ?? crypto.randomUUID(),
      name,
      stationIds: [...form.stationIds],
      isLoop: form.isLoop,
      isOneWay: form.isOneWay,
      intervalMinutes: interval,
      firstService: form.firstService,
      lastService: form.lastService,
      travelMinutesPerStop: travel,
    },
  }
}

export const useTransitStore = create<TransitState>((set) => ({
  network: { stations: [], routes: [] },

  reload: () => set({ network: getNetwork() }),

  addStation: (name) => {
    const { error } = storageAddStation(name)
    if (error) return error
    set({ network: getNetwork() })
    return null
  },

  renameStation: (id, name) => {
    const { error } = storageRenameStation(id, name)
    if (error) return error
    set({ network: getNetwork() })
    return null
  },

  deleteStation: (id) => {
    const { error } = storageRemoveStation(id)
    if (error) return error
    set({ network: getNetwork() })
    return null
  },

  saveRoute: (form, editingId) => {
    const { route, error } = buildRoute(form, editingId)
    if (error) return error
    const { error: saveError } = storageSaveRoute(route!)
    if (saveError) return saveError
    set({ network: getNetwork() })
    return null
  },

  deleteRoute: (id) => {
    storageRemoveRoute(id)
    set({ network: getNetwork() })
  },
}))
