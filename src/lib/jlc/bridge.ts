import type {
  BridgeHealth,
  EdaComponentInfo,
  EdaProjectInfo,
  EdaWindow,
  McuPinMap,
} from './types'

export const BRIDGE_PORT_START = 49620
export const BRIDGE_PORT_END = 49629
export const BRIDGE_SERVICE_ID = 'easyeda-bridge'

const MCU_SYMBOL_RE =
  /(GD32|STM32|AT32|APM32|MM32|CH32|HK32|N32|CW32|ESP32|LPC\d|RP2040|KL\d|KE\d)/i

async function jsonFetch<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 10000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export async function probeHealth(port: number): Promise<BridgeHealth | null> {
  try {
    const health = await jsonFetch<BridgeHealth>(
      `http://127.0.0.1:${port}/health`,
      undefined,
      1500,
    )
    return health.service === BRIDGE_SERVICE_ID ? health : null
  } catch {
    return null
  }
}

export async function scanBridge(): Promise<{ port: number; health: BridgeHealth } | null> {
  for (let port = BRIDGE_PORT_START; port <= BRIDGE_PORT_END; port++) {
    const health = await probeHealth(port)
    if (health) return { port, health }
  }
  return null
}

export async function getEdaWindows(port: number): Promise<EdaWindow[]> {
  const res = await jsonFetch<{ windows: EdaWindow[] }>(
    `http://127.0.0.1:${port}/eda-windows`,
  )
  return res.windows ?? []
}

export async function selectEdaWindow(port: number, windowId: string): Promise<boolean> {
  const res = await jsonFetch<{ success: boolean }>(
    `http://127.0.0.1:${port}/eda-windows/select`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windowId }),
    },
  )
  return res.success
}

export async function execute<T = unknown>(
  port: number,
  code: string,
  windowId?: string,
): Promise<T> {
  const res = await jsonFetch<{ success: boolean; result?: T; error?: string }>(
    `http://127.0.0.1:${port}/execute`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, windowId }),
    },
    35000,
  )
  if (!res.success) throw new Error(res.error || 'EDA 执行失败')
  return res.result as T
}

export async function fetchProjectInfo(port: number): Promise<EdaProjectInfo | null> {
  const code = `
const project = await eda.dmt_Project.getCurrentProjectInfo();
if (!project) return null;
return {
  uuid: project.uuid,
  name: project.friendlyName || project.name,
  boards: (project.data || []).map((b) => ({
    name: b.name,
    schematicName: b.schematic && b.schematic.name,
  })),
};`
  return execute<EdaProjectInfo | null>(port, code)
}

export async function findMcuCandidates(port: number): Promise<EdaComponentInfo[]> {
  const code = `
const comps = await eda.sch_PrimitiveComponent.getAll(undefined, true);
const out = [];
for (const c of comps || []) {
  let designator = '';
  let name = '';
  let symbolName = '';
  let symbolUuid = '';
  try { designator = (await c.getState_Designator()) || ''; } catch {}
  try { name = (await c.getState_Name()) || ''; } catch {}
  try {
    const s = await c.getState_Symbol();
    symbolName = (s && s.name) || '';
    symbolUuid = (s && s.uuid) || '';
  } catch {}
  out.push({ primitiveId: c.primitiveId, designator, name, symbolName, symbolUuid });
}
return out;`
  const comps = await execute<EdaComponentInfo[]>(port, code)
  return (comps ?? []).filter(
    (c) => /U\d+/i.test(c.designator) && MCU_SYMBOL_RE.test(`${c.symbolName} ${c.name}`),
  )
}

/** 读取原理图当前鼠标选中的图元 ID（含 MCU 器件本体） */
export async function getSelectedPrimitiveIds(
  port: number,
  windowId?: string,
): Promise<string[]> {
  const code = `
const ids = await eda.sch_SelectControl.getAllSelectedPrimitives_PrimitiveId();
return Array.isArray(ids) ? ids : [];`
  const ids = await execute<string[]>(port, code, windowId)
  return Array.isArray(ids) ? ids : []
}

export async function fetchMcuPinMap(
  port: number,
  primitiveId: string,
  windowId?: string,
): Promise<McuPinMap> {
  const code = `
const comp = await eda.sch_PrimitiveComponent.get('${primitiveId}');
let designator = '';
let symbolName = '';
try { designator = (await comp.getState_Designator()) || ''; } catch {}
try { const s = await comp.getState_Symbol(); symbolName = (s && s.name) || ''; } catch {}
const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId('${primitiveId}');
const wires = await eda.sch_PrimitiveWire.getAll();
const wireList = [];
for (const w of wires || []) {
  const line = await w.getState_Line();
  const net = await w.getState_Net();
  if (!line || !net) continue;
  const pts = [];
  for (let i = 0; i < line.length; i += 2) pts.push([line[i], line[i + 1]]);
  wireList.push({ net, pts });
}
const result = [];
for (const p of pins || []) {
  const num = await p.getState_PinNumber();
  const name = await p.getState_PinName();
  const x = await p.getState_X();
  const y = await p.getState_Y();
  const nets = new Set();
  for (const w of wireList) {
    for (const pt of w.pts) {
      if (Math.abs(pt[0] - x) < 1e-6 && Math.abs(pt[1] - y) < 1e-6) {
        nets.add(w.net);
        break;
      }
    }
  }
  result.push({ number: num, name, x, y, net: nets.size ? [...nets].join('|') : null });
}
return { componentId: '${primitiveId}', designator, symbolName, pins: result };`
  return execute<McuPinMap>(port, code, windowId)
}
