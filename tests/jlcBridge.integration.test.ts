import { describe, expect, it } from 'vitest'
import {
  fetchMcuPinMap,
  fetchProjectInfo,
  findMcuCandidates,
  getEdaWindows,
  scanBridge,
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
})
