import type { Station, TransitNetwork, TransitRoute } from '@/types'

const NETWORK_KEY = 'bus_transit_network'

const EMPTY_NETWORK: TransitNetwork = { stations: [], routes: [] }

export function getNetwork(): TransitNetwork {
  try {
    const raw = localStorage.getItem(NETWORK_KEY)
    if (!raw) return { ...EMPTY_NETWORK }
    const parsed = JSON.parse(raw) as Partial<TransitNetwork>
    return {
      stations: Array.isArray(parsed.stations) ? parsed.stations : [],
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
    }
  } catch {
    return { ...EMPTY_NETWORK }
  }
}

function saveNetwork(network: TransitNetwork): void {
  localStorage.setItem(NETWORK_KEY, JSON.stringify(network))
}

/* ---------- 站点 ---------- */

export function findStationByName(name: string): Station | null {
  const trimmed = name.trim()
  return getNetwork().stations.find((s) => s.name === trimmed) ?? null
}

export function addStation(name: string): { station?: Station; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { error: '站点名不能为空' }
  const network = getNetwork()
  if (network.stations.some((s) => s.name === trimmed)) {
    return { error: `已存在同名站「${trimmed}」` }
  }
  const station: Station = { id: crypto.randomUUID(), name: trimmed }
  network.stations.push(station)
  saveNetwork(network)
  return { station }
}

export function renameStation(id: string, name: string): { error?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { error: '站点名不能为空' }
  const network = getNetwork()
  const target = network.stations.find((s) => s.id === id)
  if (!target) return { error: '站点不存在' }
  if (network.stations.some((s) => s.id !== id && s.name === trimmed)) {
    return { error: `已存在同名站「${trimmed}」` }
  }
  target.name = trimmed
  saveNetwork(network)
  return {}
}

export function removeStation(id: string): { error?: string } {
  const network = getNetwork()
  const usedBy = network.routes.filter((r) => r.stationIds.includes(id))
  if (usedBy.length > 0) {
    return { error: `站点仍被线路使用:${usedBy.map((r) => r.name).join('、')}` }
  }
  saveNetwork({ ...network, stations: network.stations.filter((s) => s.id !== id) })
  return {}
}

/* ---------- 线路 ---------- */

export function findRouteByName(name: string): TransitRoute | null {
  const trimmed = name.trim()
  return getNetwork().routes.find((r) => r.name === trimmed) ?? null
}

export function saveRoute(route: TransitRoute): { error?: string } {
  const network = getNetwork()
  const idx = network.routes.findIndex((r) => r.id === route.id)
  if (network.routes.some((r) => r.id !== route.id && r.name === route.name)) {
    return { error: `已存在同名线路「${route.name}」` }
  }
  if (idx >= 0) network.routes[idx] = route
  else network.routes.push(route)
  saveNetwork(network)
  return {}
}

export function removeRoute(id: string): void {
  const network = getNetwork()
  saveNetwork({ ...network, routes: network.routes.filter((r) => r.id !== id) })
}
