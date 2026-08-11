export interface BridgeHealth {
  service: string
  status: string
  edaConnected: boolean
  edaWindowCount: number
  activeWindowId: string | null
  pendingRequests: number
  timestamp: number
}

export interface EdaWindow {
  windowId: string
  connected: boolean
  active: boolean
}

export interface EdaProjectInfo {
  uuid?: string
  name?: string
  boards?: { name: string; schematicName?: string }[]
}

export interface EdaComponentInfo {
  primitiveId: string
  designator: string
  name: string
  symbolName: string
  symbolUuid: string
  componentName: string
  modelName?: string
  otherProperty?: Record<string, string>
}

export interface EdaPinInfo {
  number: string
  name: string
  x: number
  y: number
  /** 引脚旋转角（端口应同向摆放） */
  rotation?: number
  net: string | null
  /** 连接方式：网络端口 / 线段 / 无连接 */
  conn?: 'port' | 'wire' | 'none'
  /** 命中网络端口的图元 ID（conn=port 时） */
  portId?: string | null
  /** 网络端口当前网络名（conn=port 时） */
  portNet?: string | null
}

export interface McuPinMap {
  componentId: string
  designator: string
  symbolName: string
  modelName: string
  pins: EdaPinInfo[]
}

export type ImportSkipReason = 'unmatched' | 'not-io' | 'special' | 'no-net'

export interface ImportPlanItem {
  canonical: string
  edaName: string
  net: string
}

export interface ImportSkipItem {
  edaName: string
  canonical: string | null
  net: string | null
  reason: ImportSkipReason
}

export interface ImportPlan {
  deviceId: string
  matched: ImportPlanItem[]
  skipped: ImportSkipItem[]
}

export type ImportChangeKind = 'add' | 'change' | 'keep' | 'remove'

export interface ImportDiffItem {
  pin: string
  kind: ImportChangeKind
  oldLabel?: string
  newLabel?: string
  oldMode?: string
  newMode?: string
}

export type ExportChangeStatus = 'change' | 'keep' | 'skip'

export interface ExportChangeItem {
  pin: string
  edaName: string
  oldNet: string | null
  newNet: string
  status: ExportChangeStatus
  skipReason?: string
  /** 同步动作：更新端口 / 改线段网络 / 新增端口 */
  action?: 'update-port' | 'rename-wire' | 'place-port'
  /** 命中网络端口的图元 ID（action=update-port 时） */
  portId?: string | null
  /** 输入/输出方向，决定放置 IN / OUT 网络端口 */
  mode?: 'INPUT' | 'OUTPUT'
  /** 引脚在原理图上的坐标（放置标签用） */
  x?: number
  y?: number
  /** 端口摆放旋转角（与 MCU 引脚同向） */
  rotation?: number
}

export interface SyncAction {
  action: 'update-port' | 'rename-wire' | 'place-port'
  net: string
  x: number
  y: number
  direction: 'IN' | 'OUT'
  rotation?: number
  portId?: string | null
  oldNet?: string | null
}

export interface SyncResult {
  updated: number
  renamed: number
  placed: number
  failed: string[]
}

export interface ExportPlan {
  deviceId: string
  changes: ExportChangeItem[]
  kept: ExportChangeItem[]
  skipped: ExportChangeItem[]
}
