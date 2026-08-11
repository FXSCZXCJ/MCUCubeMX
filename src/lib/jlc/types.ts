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
}

export interface EdaPinInfo {
  number: string
  name: string
  x: number
  y: number
  net: string | null
}

export interface McuPinMap {
  componentId: string
  designator: string
  symbolName: string
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
