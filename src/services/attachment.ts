import type { Attachment, TransitNetwork, TransitRoute, WindowScene } from '@/types'

/** 区间分隔符,长的放前面优先匹配 */
const SEPARATOR = /(->|→|—|–|到|至|\/|-)/

interface SegmentEndpoints {
  fromName: string
  toName: string
}

/**
 * 把「区间」自由文本解析为起讫站名。
 * 依次尝试每个分隔符位置;多段(如 A→B→C)退化为首末两段。
 */
export function parseSegment(segment: string): SegmentEndpoints | null {
  const text = segment.trim()
  if (!text) return null
  const matches: { index: number; length: number }[] = []
  const re = new RegExp(SEPARATOR.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length })
  }
  if (matches.length === 0) return null
  const first = matches[0]
  const last = matches[matches.length - 1]
  const fromName = text.slice(0, first.index).trim()
  const toName = text.slice(last.index + last.length).trim()
  if (!fromName || !toName) return null
  return { fromName, toName }
}

/** 单向非环线要求区间方向与站点顺序一致 */
function directionOk(route: TransitRoute, fromIdx: number, toIdx: number): boolean {
  if (!route.isOneWay) return true
  if (route.isLoop) return true
  return fromIdx < toIdx
}

/**
 * 把一条窗景记录挂到线网上:按线路名精确匹配线路,
 * 区间两端都必须是该线路上的站点。原记录不做任何改动。
 */
export function attachScene(scene: WindowScene, network: TransitNetwork): Attachment {
  const routeName = scene.routeName.trim()
  const route = network.routes.find((r) => r.name === routeName)
  if (!route) {
    return { status: 'unlinked', reason: `线网中没有线路「${routeName || '(空)'}」` }
  }

  const endpoints = parseSegment(scene.segment)
  if (!endpoints) {
    return { status: 'unlinked', reason: '区间格式无法识别(应为「起点→终点」)' }
  }

  const fromStation = network.stations.find((s) => s.name === endpoints.fromName)
  const toStation = network.stations.find((s) => s.name === endpoints.toName)
  const fromIdx = fromStation ? route.stationIds.indexOf(fromStation.id) : -1
  const toIdx = toStation ? route.stationIds.indexOf(toStation.id) : -1
  if (fromIdx < 0 || toIdx < 0) {
    const missing = [
      fromIdx < 0 ? endpoints.fromName : null,
      toIdx < 0 ? endpoints.toName : null,
    ].filter(Boolean)
    return { status: 'unlinked', reason: `站点不在线路「${route.name}」上:${missing.join('、')}` }
  }
  if (fromIdx === toIdx) {
    return { status: 'unlinked', reason: '区间起点与终点相同' }
  }
  if (!directionOk(route, fromIdx, toIdx)) {
    return { status: 'unlinked', reason: `区间方向与单向线路「${route.name}」相反` }
  }

  return {
    status: 'linked',
    routeId: route.id,
    routeName: route.name,
    fromStationId: fromStation!.id,
    toStationId: toStation!.id,
    fromName: endpoints.fromName,
    toName: endpoints.toName,
  }
}

/** 批量挂接,返回 recordId → 挂接结果 */
export function attachScenes(
  scenes: WindowScene[],
  network: TransitNetwork,
): Map<string, Attachment> {
  const map = new Map<string, Attachment>()
  for (const scene of scenes) {
    map.set(scene.id, attachScene(scene, network))
  }
  return map
}

/**
 * 某段行程(一条线路上按行驶方向的站点序列)沿途的已挂接记录:
 * 记录挂在同一线路,且起讫站都落在该段序列内、方向一致。
 */
export function scenesAlongLeg(
  legStationIds: string[],
  routeId: string,
  scenes: WindowScene[],
  attachments: Map<string, Attachment>,
): WindowScene[] {
  const position = new Map<string, number>()
  legStationIds.forEach((id, i) => position.set(id, i))
  return scenes.filter((scene) => {
    const att = attachments.get(scene.id)
    if (!att || att.status !== 'linked' || att.routeId !== routeId) return false
    const from = position.get(att.fromStationId)
    const to = position.get(att.toStationId)
    return from !== undefined && to !== undefined && from < to
  })
}
