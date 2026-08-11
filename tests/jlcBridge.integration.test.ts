import { describe, expect, it } from 'vitest'
import {
  applySyncActions,
  execute,
  fetchMcuPinMap,
  fetchProjectInfo,
  findMcuCandidates,
  getEdaWindows,
  scanBridge,
  selectEdaWindow,
} from '../src/lib/jlc/bridge'

// 本地 bridge-server 在线且 EDA 已连接时才运行；CI/离线环境自动跳过
const live = await scanBridge()
const ready = live !== null && live.health.edaConnected === true

describe('嘉立创桥集成测试', () => {
  const run = ready

  it.runIf(run)('健康检查与 EDA 窗口列表', async () => {
    expect(live).toBeTruthy()
    const windows = await getEdaWindows(live!.port)
    expect(windows.length).toBeGreaterThan(0)
    const active = windows.find((w) => w.active) ?? windows[0]
    await expect(selectEdaWindow(live!.port, active.windowId)).resolves.toBe(true)
  })

  it.runIf(run)('读取当前工程', async () => {
    const project = await fetchProjectInfo(live!.port)
    expect(project).toBeTruthy()
    expect(project!.name).toBeTruthy()
    expect(Array.isArray(project!.boards)).toBe(true)
    expect(Array.isArray(project!.boards?.[0]?.pages)).toBe(true)
  })

  it.runIf(run)('扫描 MCU 并读取引脚→网络映射', async () => {
    const candidates = await findMcuCandidates(live!.port)
    expect(candidates.length).toBeGreaterThan(0)
    const map = await fetchMcuPinMap(live!.port, candidates[0].primitiveId)
    expect(map.pins.length).toBeGreaterThan(0)
    expect(map.pins[0]).toHaveProperty('net')
  })

  it.runIf(run)('同步动作返回结构含 failed 字段', async () => {
    const x = 9000
    const y = 9000
    const res = await applySyncActions(live!.port, [
      { action: 'place-port', net: '__SYNC_TEST__', x, y, direction: 'IN', rotation: 0 },
    ])
    expect(res.placed).toBe(1)
    expect(Array.isArray(res.failed)).toBe(true)
    const code = `
const comps = await eda.sch_PrimitiveComponent.getAll(undefined, false);
let removed = 0;
let foundName = '';
for (const c of comps || []) {
  let cx = null;
  let cy = null;
  try { cx = await c.getState_X(); } catch {}
  try { cy = await c.getState_Y(); } catch {}
  if (cx === ${x} && cy === ${y}) {
    try { foundName = (await c.getState_Name()) || ''; } catch {}
    try { await eda.sch_PrimitiveComponent.delete(c.primitiveId); removed++; } catch {}
  }
}
return { removed, foundName };`
    const res2 = await execute<{ removed: number; foundName: string }>(live!.port, code)
    expect(res2.removed).toBeGreaterThan(0)
    expect(res2.foundName).toBe('__SYNC_TEST__')
  })
})
