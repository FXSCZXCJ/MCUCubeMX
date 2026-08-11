export interface JlcPrefs {
  /** 上次同步的器件 ID（GD32L233RCT6 等） */
  deviceId?: string
  /** 上次选中的 MCU 位号（U1），原理图里相对稳定 */
  designator?: string
  /** 上次选中的 MCU 型号名，用于显示提示 */
  symbolName?: string
  /** 一键同步时跳过变更确认对话框 */
  autoSync?: boolean
  /** 同步方式：线段/端口/转化为网络端口/转化为线段 */
  syncMode?: 'port' | 'wire' | 'convert' | 'towire'
}

const STORAGE_KEY = 'mcucubemx:jlc-prefs'

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function loadPrefs(): JlcPrefs {
  const s = storage()
  if (!s) return {}
  try {
    const raw = s.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as JlcPrefs) : {}
  } catch {
    return {}
  }
}

export function savePrefs(prefs: JlcPrefs): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* 存储失败不影响主流程 */
  }
}

export function mergePrefs(patch: Partial<JlcPrefs>): JlcPrefs {
  const next = { ...loadPrefs(), ...patch }
  savePrefs(next)
  return next
}
