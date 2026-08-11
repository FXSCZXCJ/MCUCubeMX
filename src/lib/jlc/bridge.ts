import type {
  BridgeHealth,
  EdaComponentInfo,
  EdaProjectInfo,
  EdaWindow,
  McuPinMap,
  SyncAction,
  SyncResult,
} from './types'
import { resolveModelName } from './import'

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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 35000)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, windowId }),
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; result?: T; error?: string }
      | null
    if (!res.ok || !data?.success) {
      // 透传 EDA 的真实错误，避免只看到 "HTTP 500"
      const message = data?.error || `HTTP ${res.status}`
      console.error('[JLC/execute] 调用失败', {
        status: res.status,
        error: message,
        windowId: windowId ?? null,
        code: code.slice(0, 400),
      })
      const err = new Error(message) as Error & { jlcLogged?: boolean }
      err.jlcLogged = true
      throw err
    }
    return data.result as T
  } catch (err) {
    if (!(err instanceof Error && (err as Error & { jlcLogged?: boolean }).jlcLogged)) {
      // 网络层失败（连接被拒/超时/中止）也记录
      console.error('[JLC/execute] 网络层失败', {
        port,
        windowId: windowId ?? null,
        error: err instanceof Error ? err.message : String(err),
        code: code.slice(0, 200),
      })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchProjectInfo(port: number): Promise<EdaProjectInfo | null> {
  const code = `
const project = await eda.dmt_Project.getCurrentProjectInfo();
if (!project) return null;
let currentBoard = '';
try {
  const b = await eda.dmt_Board.getCurrentBoardInfo();
  currentBoard = (b && b.name) || '';
} catch {}
let currentPage = '';
try {
  const pg = await eda.dmt_Schematic.getCurrentSchematicPageInfo();
  currentPage = (pg && pg.name) || '';
} catch {}
return {
  uuid: project.uuid,
  name: project.friendlyName || project.name,
  currentBoard,
  currentPage,
  boards: (project.data || []).map((b) => ({
    name: b.name,
    schematicName: b.schematic && b.schematic.name,
    pages: ((b.schematic && b.schematic.page) || []).map((p) => p.name),
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
  let componentName = '';
  let otherProperty = {};
  try { designator = (await c.getState_Designator()) || ''; } catch {}
  try { name = (await c.getState_Name()) || ''; } catch {}
  try {
    const s = await c.getState_Symbol();
    symbolName = (s && s.name) || '';
    symbolUuid = (s && s.uuid) || '';
  } catch {}
  try {
    const comp = await c.getState_Component();
    componentName = (comp && comp.name) || '';
  } catch {}
  try { otherProperty = (await c.getState_OtherProperty()) || {}; } catch {}
  out.push({ primitiveId: c.primitiveId, designator, name, symbolName, symbolUuid, componentName, otherProperty });
}
return out;`
  const comps = await execute<EdaComponentInfo[]>(port, code)
  return (comps ?? []).filter(
    (c) => /U\d+/i.test(c.designator) && MCU_SYMBOL_RE.test(resolveModelName(c)),
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
let nameAttr = '';
let componentName = '';
try { designator = (await comp.getState_Designator()) || ''; } catch {}
try { const s = await comp.getState_Symbol(); symbolName = (s && s.name) || ''; } catch {}
try { nameAttr = (await comp.getState_Name()) || ''; } catch {}
try { const c = await comp.getState_Component(); componentName = (c && c.name) || ''; } catch {}
const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId('${primitiveId}');
let wires = [];
try { wires = await eda.sch_PrimitiveWire.getAll(); } catch (err) { failures.push('读取导线: ' + (err && err.message)); }
const wireList = [];
for (const w of wires || []) {
  const line = await w.getState_Line();
  const net = await w.getState_Net();
  if (!line || !net) continue;
  const pts = [];
  for (let i = 0; i < line.length; i += 2) pts.push([line[i], line[i + 1]]);
  wireList.push({ net, pts });
}
const portComps = await eda.sch_PrimitiveComponent.getAll(undefined, false);
const portList = [];
for (const c of portComps || []) {
  let symbolName = '';
  try { const s = await c.getState_Symbol(); symbolName = (s && s.name) || ''; } catch {}
  if (!/netport|netflag|power|ground|voltage|^vcc|^vdd|^vss/i.test(symbolName)) continue;
  let other = {};
  try { other = (await c.getState_OtherProperty()) || {}; } catch {}
  // NetPort 的网络名存在元件 Name 属性里（电源符号在 Global Net Name）
  let portName = '';
  try { portName = (await c.getState_Name()) || ''; } catch {}
  let dir = null;
  const dirMatch = /^netport-([a-z0-9]+)/i.exec(symbolName);
  if (dirMatch) dir = dirMatch[1].toUpperCase();
  // 端口/电源符号的元件位置就是连接点（实测 NetPort 的引脚尖=元件位置），
  // 不依赖 getAllPinsByPrimitiveId，避免该接口偶发失败导致端口被漏检
  let cx = null;
  let cy = null;
  try { cx = await c.getState_X(); } catch {}
  try { cy = await c.getState_Y(); } catch {}
  if (typeof cx === 'number' && typeof cy === 'number') {
    portList.push({
      id: c.primitiveId,
      x: cx,
      y: cy,
      net: other['Global Net Name'] || portName || other['Net'] || '',
      dir,
    });
  }
}
// 导线连通图：端口放在线段末端而非引脚尖时，也能通过同一线段网识别为已连接
const idByKey = new Map();
const parent = [];
function addPt(px, py) {
  const k = px.toFixed(3) + ',' + py.toFixed(3);
  if (idByKey.has(k)) return idByKey.get(k);
  const id = parent.length;
  idByKey.set(k, id);
  parent.push(id);
  return id;
}
function findPt(a) {
  while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
  return a;
}
function unionPt(a, b) {
  const ra = findPt(a);
  const rb = findPt(b);
  if (ra !== rb) parent[ra] = rb;
}
for (const w of wireList) {
  for (const pt of w.pts) addPt(pt[0], pt[1]);
}
for (const w of wireList) {
  for (let i = 0; i < w.pts.length - 1; i++) {
    unionPt(addPt(w.pts[i][0], w.pts[i][1]), addPt(w.pts[i + 1][0], w.pts[i + 1][1]));
  }
}
const result = [];
for (const p of pins || []) {
  const num = await p.getState_PinNumber();
  const name = await p.getState_PinName();
  const x = await p.getState_X();
  const y = await p.getState_Y();
  let rotation = 0;
  try { rotation = (await p.getState_Rotation()) || 0; } catch {}
  let conn = 'none';
  let portId = null;
  let portNet = null;
  let portDir = null;
  const pinWireId = addPt(x, y);
  for (const pt of portList) {
    const sameSpot = Math.abs(pt.x - x) < 0.5 && Math.abs(pt.y - y) < 0.5;
    const wired = findPt(addPt(pt.x, pt.y)) === findPt(pinWireId);
    if (sameSpot || wired) {
      conn = 'port';
      portId = pt.id;
      portNet = pt.net || null;
      portDir = pt.dir || null;
      break;
    }
  }
  const nets = new Set();
  if (conn === 'none') {
    for (const w of wireList) {
      for (const pt of w.pts) {
        if (Math.abs(pt[0] - x) < 0.5 && Math.abs(pt[1] - y) < 0.5) {
          nets.add(w.net);
          break;
        }
      }
    }
    if (nets.size) conn = 'wire';
  }
  result.push({
    number: num,
    name,
    x,
    y,
    rotation,
    net: conn === 'port' ? portNet : nets.size ? [...nets].join('|') : null,
    conn,
    portId,
    portNet,
    portDir,
  });
}
return { componentId: '${primitiveId}', designator, symbolName, name: nameAttr, componentName, pins: result };`
  const map = await execute<Omit<McuPinMap, 'modelName'> & { name: string; componentName: string }>(
    port,
    code,
    windowId,
  )
  return {
    ...map,
    modelName: resolveModelName({
      name: map.name,
      symbolName: map.symbolName,
      componentName: map.componentName,
    }),
  }
}

/**
 * 按引脚连接方式执行同步：
 * - update-port：更新已连接网络端口的网络名（Global Net Name / 名称）
 * - rename-wire：改线段网络（同网络全部导线 NET 属性）
 * - place-port：在引脚旁新增网络端口（输入端 IN、输出端 OUT）
 */
export async function applySyncActions(
  port: number,
  actions: SyncAction[],
  windowId?: string,
): Promise<SyncResult> {
  if (actions.length === 0) {
    return { updated: 0, replaced: 0, converted: 0, renamed: 0, placed: 0, toWire: 0, failed: [] }
  }
  const code = `
const actions = ${JSON.stringify(actions)};
let updated = 0;
let replaced = 0;
let converted = 0;
let renamed = 0;
let placed = 0;
let toWire = 0;
const failures = [];
for (const a of actions.filter((x) => x.action === 'update-port')) {
  try {
    const c = await eda.sch_PrimitiveComponent.get(a.portId);
    let other = {};
    try { other = (await c.getState_OtherProperty()) || {}; } catch {}
    const merged = Object.assign({}, other, { 'Global Net Name': a.net });
    try {
      await eda.sch_PrimitiveComponent.modify(a.portId, { name: a.net, otherProperty: merged });
    } catch {
      await eda.sch_PrimitiveComponent.modify(a.portId, { otherProperty: merged });
    }
    updated++;
  } catch (err) {
    failures.push('更新端口 ' + a.net + ': ' + (err && err.message));
  }
}
for (const a of actions.filter((x) => x.action === 'replace-port')) {
  try {
    await eda.sch_PrimitiveComponent.delete(a.portId);
    await eda.sch_PrimitiveComponent.createNetPort(a.direction, a.net, a.x, a.y, a.rotation || 0, false);
    replaced++;
  } catch (err) {
    failures.push('更换端口 ' + a.net + ': ' + (err && err.message));
  }
}
for (const a of actions.filter((x) => x.action === 'wire-to-port')) {
  try {
    // 删除与该引脚连接点重合的原线段
    const wireList = await eda.sch_PrimitiveWire.getAll();
    for (const w of wireList || []) {
      let line = null;
      try { line = await w.getState_Line(); } catch {}
      if (!line) continue;
      let touch = false;
      for (let i = 0; i < line.length; i += 2) {
        if (Math.abs(line[i] - a.x) < 0.5 && Math.abs(line[i + 1] - a.y) < 0.5) {
          touch = true;
          break;
        }
      }
      if (touch) {
        try { await eda.sch_PrimitiveWire.delete(w.primitiveId); } catch {}
      }
    }
    // 在引脚处放置网络端口
    await eda.sch_PrimitiveComponent.createNetPort(a.direction, a.net, a.x, a.y, a.rotation || 0, false);
    converted++;
  } catch (err) {
    failures.push('线段转端口 ' + a.net + ': ' + (err && err.message));
  }
}
for (const a of actions.filter((x) => x.action === 'port-to-wire' || x.action === 'add-wire')) {
  try {
    if (a.action === 'port-to-wire' && a.portId) {
      await eda.sch_PrimitiveComponent.delete(a.portId);
    }
    // 从引脚连接点向外延伸 10 单位的小线段（方向按引脚旋转角）
    const rad = (a.rotation || 0) * Math.PI / 180;
    const ex = a.x + 10 * Math.cos(rad);
    const ey = a.y - 10 * Math.sin(rad);
    await eda.sch_PrimitiveWire.create([a.x, a.y, ex, ey], a.net);
    toWire++;
  } catch (err) {
    failures.push('转线段 ' + a.net + ': ' + (err && err.message));
  }
}
const wires = await eda.sch_PrimitiveWire.getAll();
const byNet = {};
for (const w of wires || []) {
  let net = null;
  try { net = await w.getState_Net(); } catch {}
  if (!net) continue;
  (byNet[net] = byNet[net] || []).push(w);
}
for (const a of actions.filter((x) => x.action === 'rename-wire')) {
  const list = byNet[a.oldNet] || [];
  for (const w of list) {
    try {
      const aw = w.toAsync ? w.toAsync() : w;
      aw.setState_Net(a.net);
      await aw.done();
      renamed++;
    } catch {}
  }
}
for (const a of actions.filter((x) => x.action === 'place-port')) {
  try {
    await eda.sch_PrimitiveComponent.createNetPort(a.direction, a.net, a.x, a.y, a.rotation || 0, false);
    placed++;
  } catch (err) {
    failures.push('新增端口 ' + a.net + ': ' + (err && err.message));
  }
}
return { updated, replaced, converted, renamed, placed, toWire, failed: failures };`
  return execute<SyncResult>(port, code, windowId)
}

/**
 * 把 MCUCubeMX 配置属性写入 EDA 的 MCU 元件（otherProperty）。
 * 自动清理不再配置的 GPIO 属性（PAx_MODE/LABEL/... 前缀键）。
 */
export async function writeMcuAttributes(
  port: number,
  componentId: string,
  attributes: Record<string, string>,
  windowId?: string,
): Promise<boolean> {
  if (Object.keys(attributes).length === 0) return true
  const code = `
const componentId = ${JSON.stringify(componentId)};
const attributes = ${JSON.stringify(attributes)};
const c = await eda.sch_PrimitiveComponent.get(componentId);
if (!c) return false;
let other = {};
try { other = (await c.getState_OtherProperty()) || {}; } catch {}
const merged = Object.assign({}, other);
for (const k of Object.keys(merged)) {
  if (/^P[ABCDEFGHJ]\\d+_(MODE|LABEL|OTYPE|SPEED|LEVEL|PULL|EXTI)$/i.test(k) && !(k in attributes)) {
    delete merged[k];
  }
}
for (const k of Object.keys(attributes)) merged[k] = attributes[k];
await eda.sch_PrimitiveComponent.modify(componentId, { otherProperty: merged });
return true;`
  return execute<boolean>(port, code, windowId)
}
