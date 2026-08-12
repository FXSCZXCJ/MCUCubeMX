import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../src/stores/project'

describe('引脚分组 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('新建/重名忽略/改名/删除', () => {
    const store = useProjectStore()
    store.addGroup('电源控制')
    store.addGroup('电源控制')
    expect(store.groups).toHaveLength(1)
    store.renameGroup('电源控制', '电源')
    expect(store.groups[0].name).toBe('电源')
    store.deleteGroup('电源')
    expect(store.groups).toHaveLength(0)
  })

  it('单归属：设置新组自动移出旧组，置空则移除', () => {
    const store = useProjectStore()
    store.addGroup('A')
    store.addGroup('B')
    store.setPinGroup('PA5', 'A')
    store.setPinGroup('PA5', 'B')
    expect(store.groups.find((g) => g.name === 'A')?.pins).toEqual([])
    expect(store.groups.find((g) => g.name === 'B')?.pins).toEqual(['PA5'])
    store.setPinGroup('PA5', null)
    expect(store.groups.find((g) => g.name === 'B')?.pins).toEqual([])
  })

  it('loadConfig 恢复 groups 与颜色', () => {
    const store = useProjectStore()
    store.loadConfig({
      version: 1,
      device: 'GD32L233RCT6',
      pins: [],
      groups: [{ name: 'G', pins: ['PA5'] }],
      naming: { prefix: 'X_' },
    })
    expect(store.groups[0]).toMatchObject({ name: 'G', pins: ['PA5'] })
    expect(store.groups[0].color).toBeTruthy()
    expect(store.prefix).toBe('X_')
  })

  it('clearAll 清空分组', () => {
    const store = useProjectStore()
    store.addGroup('A')
    store.clearAll()
    expect(store.groups).toHaveLength(0)
  })
})
