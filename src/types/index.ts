export type SeatDirection = '左' | '右'

export type Weather = '晴' | '多云' | '阴' | '小雨' | '大雨' | '雪' | '雾'

export type TreeDensity = '稀疏' | '适中' | '茂密'

export type PedestrianStatus = '稀少' | '零星' | '密集'

export interface WindowScene {
  id: string
  routeName: string
  segment: string
  seatDirection: SeatDirection
  timestamp: string
  weather: Weather
  signText: string
  treeDensity: TreeDensity
  pedestrianStatus: PedestrianStatus
  note: string
}

export interface SceneFormData {
  routeName: string
  segment: string
  seatDirection: SeatDirection
  weather: Weather
  signText: string
  treeDensity: TreeDensity
  pedestrianStatus: PedestrianStatus
  note: string
}

/* ---------- 采风路线规划台:线网模型 ---------- */

/** 站点,线网内按名字唯一 */
export interface Station {
  id: string
  name: string
}

/** 线路:站点按顺序排列,可标环线 / 单向 */
export interface TransitRoute {
  id: string
  name: string
  /** 站点 id,按行驶顺序 */
  stationIds: string[]
  /** 环线:末站之后回到首站 */
  isLoop: boolean
  /** 单向:只沿站点顺序方向行驶 */
  isOneWay: boolean
  /** 发车间隔(分钟),必须为正整数 */
  intervalMinutes: number
  /** 首班,格式 HH:MM */
  firstService: string
  /** 末班,格式 HH:MM */
  lastService: string
  /** 相邻站间行驶分钟数 */
  travelMinutesPerStop: number
}

export interface TransitNetwork {
  stations: Station[]
  routes: TransitRoute[]
}

/** 线路表单(新增 / 编辑共用) */
export interface RouteFormData {
  name: string
  stationIds: string[]
  isLoop: boolean
  isOneWay: boolean
  intervalMinutes: string
  firstService: string
  lastService: string
  travelMinutesPerStop: string
}

/* ---------- 记录挂接 ---------- */

export type Attachment =
  | {
      status: 'linked'
      routeId: string
      routeName: string
      fromStationId: string
      toStationId: string
      fromName: string
      toName: string
    }
  | { status: 'unlinked'; reason: string }

/* ---------- 规划结果 ---------- */

/** 一段乘车:在同一条线路上从上车到下车 */
export interface PlanLeg {
  routeId: string
  routeName: string
  directionLabel: string
  boardStationId: string
  alightStationId: string
  /** 分钟(自当日 0 点起) */
  boardTime: number
  alightTime: number
  stops: number
  /** 沿途经过的站点(含上下车站,按行驶方向) */
  stationIds: string[]
}

/** 一次换乘:下车后的步行 + 等下一班 */
export interface PlanTransfer {
  atStationId: string
  fromRouteName: string
  toRouteName: string
  walkMinutes: number
  waitMinutes: number
}

export interface TripPlan {
  legs: PlanLeg[]
  transfers: PlanTransfer[]
  departTime: number
  arriveTime: number
  totalMinutes: number
  totalStops: number
  transferCount: number
  /** 线路名序列,用于并列定序 */
  routeKey: string
}

export type PlanConclusion =
  | { kind: 'ok'; best: TripPlan; alternatives: TripPlan[] }
  | { kind: 'empty-network' }
  | { kind: 'same-station' }
  | { kind: 'station-unknown'; names: string[] }
  | { kind: 'duplicate-stations'; names: string[] }
  | { kind: 'invalid-route'; issues: string[] }
  | { kind: 'unreachable' }
  | { kind: 'service-over' }
