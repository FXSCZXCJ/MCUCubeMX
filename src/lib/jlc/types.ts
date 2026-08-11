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
  net: string | null
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
}

export interface ExportPlan {
  deviceId: string
  changes: ExportChangeItem[]
  kept: ExportChangeItem[]
  skipped: ExportChangeItem[]
}
