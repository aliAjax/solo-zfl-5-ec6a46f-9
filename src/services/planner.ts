import type {
  PlanConclusion,
  PlanLeg,
  PlanTransfer,
  TransitNetwork,
  TransitRoute,
  TripPlan,
} from '@/types'

/** 同站换乘步行时间(分钟) */
export const TRANSFER_WALK_MINUTES = 2
/** 并列方案最多展示的备选数量 */
export const MAX_ALTERNATIVES = 2

/* ---------- 时间工具:分钟(自当日 0 点) ---------- */

export function parseTimeToMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ---------- 线网校验:同名站、间隔非法等 ---------- */

export interface NetworkValidation {
  duplicateStationNames: string[]
  issues: string[]
}

export function validateNetwork(network: TransitNetwork): NetworkValidation {
  const nameCount = new Map<string, number>()
  for (const s of network.stations) {
    nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1)
  }
  const duplicateStationNames = [...nameCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort()

  const issues: string[] = []
  const stationIds = new Set(network.stations.map((s) => s.id))

  const routeNameCount = new Map<string, number>()
  for (const r of network.routes) {
    routeNameCount.set(r.name, (routeNameCount.get(r.name) ?? 0) + 1)
  }
  const dupRouteNames = [...routeNameCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort()
  for (const name of dupRouteNames) {
    issues.push(`存在同名线路「${name}」`)
  }

  for (const r of network.routes) {
    if (!Number.isInteger(r.intervalMinutes) || r.intervalMinutes < 1) {
      issues.push(`线路「${r.name}」发车间隔非法(应为不小于 1 的整数分钟)`)
    }
    if (!Number.isInteger(r.travelMinutesPerStop) || r.travelMinutesPerStop < 1) {
      issues.push(`线路「${r.name}」站间行驶时间非法(应为不小于 1 的整数分钟)`)
    }
    const first = parseTimeToMinutes(r.firstService)
    const last = parseTimeToMinutes(r.lastService)
    if (first === null || last === null) {
      issues.push(`线路「${r.name}」首末班时间格式非法(应为 HH:MM)`)
    } else if (first >= last) {
      issues.push(`线路「${r.name}」首班时间不早于末班时间`)
    }
    if (r.stationIds.length < 2) {
      issues.push(`线路「${r.name}」站点不足 2 个`)
    }
    if (r.stationIds.some((id) => !stationIds.has(id))) {
      issues.push(`线路「${r.name}」引用了不存在的站点`)
    }
    const dupIds = r.stationIds.filter((id, i) => r.stationIds.indexOf(id) !== i)
    if (dupIds.length > 0) {
      const names = [...new Set(dupIds)].map(
        (id) => network.stations.find((s) => s.id === id)?.name ?? id,
      )
      issues.push(`线路「${r.name}」内站点重复:${names.join('、')}`)
    }
  }
  return { duplicateStationNames, issues }
}

/* ---------- 方向模型 ---------- */

type Direction = 'forward' | 'backward'

function routeDirections(route: TransitRoute): Direction[] {
  return route.isOneWay ? ['forward'] : ['forward', 'backward']
}

/** 站点在某方向上距方向起点的站间数 */
function offsetOf(route: TransitRoute, dir: Direction, stationIndex: number): number {
  const n = route.stationIds.length
  if (dir === 'forward') return stationIndex
  if (route.isLoop) return (n - stationIndex) % n
  return n - 1 - stationIndex
}

/** 从 stationIndex 沿方向走 h 站后的站点下标 */
function advance(route: TransitRoute, dir: Direction, stationIndex: number, h: number): number {
  const n = route.stationIds.length
  if (dir === 'forward') return (stationIndex + h) % n
  return (((stationIndex - h) % n) + n) % n
}

/** 沿某方向最多可走的站间数(环线不绕回上车站) */
function maxHops(route: TransitRoute, dir: Direction, stationIndex: number): number {
  const n = route.stationIds.length
  if (route.isLoop) return n - 1
  return dir === 'forward' ? n - 1 - stationIndex : stationIndex
}

/**
 * 班次:首班 + k × 间隔,k 不超过末班。
 * 车辆从方向起点发出,途经各站时刻按站间行驶时间顺推。
 */
function nextDeparture(
  route: TransitRoute,
  dir: Direction,
  stationIndex: number,
  readyTime: number,
): number | null {
  const first = parseTimeToMinutes(route.firstService)
  const last = parseTimeToMinutes(route.lastService)
  if (first === null || last === null || first >= last) return null
  const offset = offsetOf(route, dir, stationIndex) * route.travelMinutesPerStop
  const lastK = Math.floor((last - first) / route.intervalMinutes)
  const need = readyTime - first - offset
  const k = Math.max(0, Math.ceil(need / route.intervalMinutes))
  if (k > lastK) return null
  return first + k * route.intervalMinutes + offset
}

function directionLabel(route: TransitRoute, dir: Direction, network: TransitNetwork): string {
  const nameOf = (id: string) => network.stations.find((s) => s.id === id)?.name ?? '?'
  const n = route.stationIds.length
  if (route.isLoop) return dir === 'forward' ? '环线·顺向' : '环线·反向'
  return dir === 'forward'
    ? `往 ${nameOf(route.stationIds[n - 1])}`
    : `往 ${nameOf(route.stationIds[0])}`
}

/* ---------- 结构可达性(忽略时刻,区分「不可达」与「末班已过」) ---------- */

function reachableStations(network: TransitNetwork, originId: string): Set<string> {
  const adj = new Map<string, Set<string>>()
  const addEdge = (a: string, b: string) => {
    const set = adj.get(a) ?? new Set<string>()
    set.add(b)
    adj.set(a, set)
  }
  for (const route of network.routes) {
    for (const dir of routeDirections(route)) {
      for (let i = 0; i < route.stationIds.length; i++) {
        if (maxHops(route, dir, i) < 1) continue
        addEdge(route.stationIds[i], route.stationIds[advance(route, dir, i, 1)])
      }
    }
  }
  const seen = new Set<string>([originId])
  const queue = [originId]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

/* ---------- 多准则标签设定搜索 ---------- */

interface Label {
  stationId: string
  routeId: string | null
  time: number
  transfers: number
  stops: number
  routeKey: string
  legs: PlanLeg[]
}

function compareLabels(a: Label, b: Label): number {
  if (a.time !== b.time) return a.time - b.time
  if (a.transfers !== b.transfers) return a.transfers - b.transfers
  if (a.stops !== b.stops) return a.stops - b.stops
  return a.routeKey < b.routeKey ? -1 : a.routeKey > b.routeKey ? 1 : 0
}

/** a 是否支配 b(到达时刻、换乘、站数都不更差,且至少一项严格更好或线路名序列不更靠后) */
function dominates(a: Label, b: Label): boolean {
  if (a.time > b.time || a.transfers > b.transfers || a.stops > b.stops) return false
  return (
    a.time < b.time ||
    a.transfers < b.transfers ||
    a.stops < b.stops ||
    a.routeKey <= b.routeKey
  )
}

function stateKey(stationId: string, routeId: string | null): string {
  return `${stationId}|${routeId ?? '-'}`
}

function mergeLegs(legs: PlanLeg[]): PlanLeg[] {
  const merged: PlanLeg[] = []
  for (const leg of legs) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.routeId === leg.routeId &&
      last.alightStationId === leg.boardStationId &&
      last.alightTime === leg.boardTime
    ) {
      merged[merged.length - 1] = {
        ...last,
        alightStationId: leg.alightStationId,
        alightTime: leg.alightTime,
        stops: last.stops + leg.stops,
        stationIds: [...last.stationIds, ...leg.stationIds.slice(1)],
      }
    } else {
      merged.push(leg)
    }
  }
  return merged
}

function toTripPlan(label: Label, departTime: number): TripPlan {
  const legs = mergeLegs(label.legs)
  const transfers: PlanTransfer[] = []
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1]
    const cur = legs[i]
    const walk = prev.routeId === cur.routeId ? 0 : TRANSFER_WALK_MINUTES
    transfers.push({
      atStationId: cur.boardStationId,
      fromRouteName: prev.routeName,
      toRouteName: cur.routeName,
      walkMinutes: walk,
      waitMinutes: cur.boardTime - prev.alightTime - walk,
    })
  }
  return {
    legs,
    transfers,
    departTime,
    arriveTime: label.time,
    totalMinutes: label.time - departTime,
    totalStops: legs.reduce((sum, leg) => sum + leg.stops, 0),
    transferCount: transfers.length,
    routeKey: legs.map((leg) => leg.routeName).join('>'),
  }
}

const MAX_ITERATIONS = 200_000

/**
 * 最早到达规划。同样输入必然同样输出:
 * 到达时刻并列时按 换乘少 → 站数少 → 线路名序列 定序。
 */
export function planTrip(
  network: TransitNetwork,
  originId: string,
  destId: string,
  departMinutes: number,
): PlanConclusion {
  if (network.stations.length === 0 || network.routes.length === 0) {
    return { kind: 'empty-network' }
  }
  const validation = validateNetwork(network)
  if (validation.duplicateStationNames.length > 0) {
    return { kind: 'duplicate-stations', names: validation.duplicateStationNames }
  }
  if (validation.issues.length > 0) {
    return { kind: 'invalid-route', issues: validation.issues }
  }
  const knownIds = new Set(network.stations.map((s) => s.id))
  const unknown = [originId, destId].filter((id) => !knownIds.has(id))
  if (unknown.length > 0) {
    return { kind: 'station-unknown', names: unknown }
  }
  if (originId === destId) {
    return { kind: 'same-station' }
  }
  if (!reachableStations(network, originId).has(destId)) {
    return { kind: 'unreachable' }
  }

  const routesByStation = new Map<string, TransitRoute[]>()
  const sortedRoutes = [...network.routes].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
  for (const route of sortedRoutes) {
    for (const sid of route.stationIds) {
      const list = routesByStation.get(sid) ?? []
      list.push(route)
      routesByStation.set(sid, list)
    }
  }

  const best = new Map<string, Label[]>()
  const queue: Label[] = []
  const start: Label = {
    stationId: originId,
    routeId: null,
    time: departMinutes,
    transfers: 0,
    stops: 0,
    routeKey: '',
    legs: [],
  }
  best.set(stateKey(originId, null), [start])
  queue.push(start)

  const destLabels: Label[] = []
  let iterations = 0

  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++
    let minIdx = 0
    for (let i = 1; i < queue.length; i++) {
      if (compareLabels(queue[i], queue[minIdx]) < 0) minIdx = i
    }
    const label = queue.splice(minIdx, 1)[0]

    if (label.stationId === destId) {
      destLabels.push(label)
      continue
    }

    for (const route of routesByStation.get(label.stationId) ?? []) {
      const stationIndex = route.stationIds.indexOf(label.stationId)
      if (stationIndex < 0) continue
      for (const dir of routeDirections(route)) {
        const isTransfer = label.routeId !== null && label.routeId !== route.id
        const ready = label.time + (isTransfer ? TRANSFER_WALK_MINUTES : 0)
        const dep = nextDeparture(route, dir, stationIndex, ready)
        if (dep === null) continue
        const hopsMax = maxHops(route, dir, stationIndex)
        const traveled: string[] = [label.stationId]
        for (let h = 1; h <= hopsMax; h++) {
          const idx = advance(route, dir, stationIndex, h)
          const alightId = route.stationIds[idx]
          traveled.push(alightId)
          const arriveTime = dep + h * route.travelMinutesPerStop
          const leg: PlanLeg = {
            routeId: route.id,
            routeName: route.name,
            directionLabel: directionLabel(route, dir, network),
            boardStationId: label.stationId,
            alightStationId: alightId,
            boardTime: dep,
            alightTime: arriveTime,
            stops: h,
            stationIds: [...traveled],
          }
          const next: Label = {
            stationId: alightId,
            routeId: route.id,
            time: arriveTime,
            transfers: label.transfers + (isTransfer ? 1 : 0),
            stops: label.stops + h,
            routeKey: label.routeKey ? `${label.routeKey}>${route.name}` : route.name,
            legs: [...label.legs, leg],
          }
          const key = stateKey(alightId, route.id)
          const bucket = best.get(key) ?? []
          if (bucket.some((b) => dominates(b, next))) continue
          best.set(
            key,
            bucket.filter((b) => !dominates(next, b)).concat(next),
          )
          queue.push(next)
        }
      }
    }
  }

  if (destLabels.length === 0) {
    return { kind: 'service-over' }
  }

  const minTime = Math.min(...destLabels.map((l) => l.time))
  const tied = destLabels
    .filter((l) => l.time === minTime)
    .sort((a, b) => {
      if (a.transfers !== b.transfers) return a.transfers - b.transfers
      if (a.stops !== b.stops) return a.stops - b.stops
      return a.routeKey < b.routeKey ? -1 : a.routeKey > b.routeKey ? 1 : 0
    })

  const seenSignatures = new Set<string>()
  const plans: TripPlan[] = []
  for (const label of tied) {
    const signature = label.legs
      .map(
        (leg) =>
          `${leg.routeId}@${leg.boardStationId}>${leg.alightStationId}#${leg.boardTime}-${leg.alightTime}`,
      )
      .join('|')
    if (seenSignatures.has(signature)) continue
    seenSignatures.add(signature)
    plans.push(toTripPlan(label, departMinutes))
    if (plans.length >= 1 + MAX_ALTERNATIVES) break
  }

  return { kind: 'ok', best: plans[0], alternatives: plans.slice(1) }
}
