import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPrefs, mergePrefs, savePrefs } from '../src/lib/jlc/prefs'
import { pickRememberedMcu } from '../src/lib/jlc/import'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('嘉立创偏好存储', () => {
  it('合并保存后可以读取', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    })
    expect(loadPrefs()).toEqual({})
    mergePrefs({ designator: 'U1', deviceId: 'GD32L233RCT6' })
    expect(loadPrefs()).toMatchObject({ designator: 'U1', deviceId: 'GD32L233RCT6' })
    mergePrefs({ autoSync: true })
    expect(loadPrefs()).toMatchObject({ autoSync: true, designator: 'U1' })
    savePrefs({})
    expect(loadPrefs()).toEqual({})
  })

  it('无 localStorage 时安全降级', () => {
    expect(loadPrefs()).toEqual({})
    expect(() => mergePrefs({ designator: 'U1' })).not.toThrow()
  })
})

describe('记忆 MCU 找回', () => {
  const candidates = [
    { primitiveId: 'e36', designator: 'U1', name: '', symbolName: 'GD32L233RCT6', symbolUuid: '', componentName: '' },
    { primitiveId: 'e999', designator: 'U2', name: '', symbolName: 'BME280', symbolUuid: '', componentName: '' },
  ]

  it('按位号找回', () => {
    expect(pickRememberedMcu(candidates, 'U1')?.primitiveId).toBe('e36')
    expect(pickRememberedMcu(candidates, 'U9')).toBeNull()
    expect(pickRememberedMcu(candidates)).toBeNull()
  })
})
