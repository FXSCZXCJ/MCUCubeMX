import { describe, expect, it } from 'vitest'
import {
  fetchMcuPinMap,
  fetchProjectInfo,
  findMcuCandidates,
  getEdaWindows,
  scanBridge,
} from '../src/lib/jlc/bridge'

// 本地 bridge-server 在线时才运行；CI/离线环境自动跳过
const live = await scanBridge()

describe.skipIf(!live)('嘉立创桥集成测试（本地 bridge 在线）', () => {
  const port = live!.port

  it('健康检查与 EDA 窗口列表', async () => {
    const windows = await getEdaWindows(port)
    expect(windows.length).toBeGreaterThan(0)
  })

  it('读取当前工程', async () => {
    const project = await fetchProjectInfo(port)
    expect(project).toBeTruthy()
    expect(project!.name).toBeTruthy()
  })

  it('扫描 MCU 并读取引脚→网络映射', async () => {
    const candidates = await findMcuCandidates(port)
    expect(candidates.length).toBeGreaterThan(0)
    const map = await fetchMcuPinMap(port, candidates[0].primitiveId)
    expect(map.pins.length).toBeGreaterThan(0)
    expect(map.pins[0]).toHaveProperty('net')
  })
})
