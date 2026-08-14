import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { PinAssignment } from '../types'
import type { useProjectStore } from '../stores/project'

type Store = ReturnType<typeof useProjectStore>

export interface PinChange {
  pin: string
  /** 覆盖前该引脚的配置（用于撤回） */
  prev?: PinAssignment
  apply: () => void
}

export interface OverwriteUndo {
  changes: { pin: string; prev?: PinAssignment }[]
  label: string
}

export function describeAssignment(a: PinAssignment | undefined): string {
  if (!a) return '未配置'
  const modeText: Record<string, string> = {
    INPUT: '输入',
    OUTPUT: '输出',
    AF: '复用(AF)',
    ANALOG: '模拟',
  }
  const base = modeText[a.mode] ?? a.mode
  return a.function ? `${base}（${a.function}）` : base
}

/**
 * 引脚占用确认 + 覆盖 + 撤回。
 * commit 对已被占用的引脚弹出确认框，确认后写入并记录可撤回快照。
 */
export function usePinOverwrite(store: Store) {
  const undo = ref<OverwriteUndo | null>(null)

  async function commit(
    label: string,
    changes: PinChange[],
    opts: { forceConfirm?: boolean } = {},
  ) {
    const conflict = changes.find((c) => store.assignments[c.pin])
    if (conflict || opts.forceConfirm) {
      const target = conflict?.pin ?? changes[0]?.pin
      const message = conflict
        ? `引脚 ${target} 当前为「${describeAssignment(store.assignments[target])}」，确定覆盖为「${label}」？`
        : `确定${label}？`
      try {
        await ElMessageBox.confirm(
          message,
          conflict ? '覆盖引脚配置' : '操作确认',
          {
            type: 'warning',
            confirmButtonText: '覆盖',
            cancelButtonText: '取消',
            distinguishCancelAndClose: true,
          },
        )
      } catch {
        return
      }
    }
    undo.value = {
      changes: changes.map((c) => ({ pin: c.pin, prev: c.prev })),
      label,
    }
    for (const c of changes) c.apply()
    ElMessage.success(`已配置「${label}」`)
  }

  function rollback() {
    const u = undo.value
    if (!u) return
    for (const r of u.changes) {
      if (r.prev) store.setPinAssignment(r.pin, r.prev)
      else store.clearPin(r.pin)
    }
    undo.value = null
    ElMessage.success('已撤回上次覆盖')
  }

  return { undo, commit, rollback }
}
