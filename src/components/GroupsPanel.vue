<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { useProjectStore } from '../stores/project'

const store = useProjectStore()

async function addGroup() {
  try {
    const { value } = await ElMessageBox.prompt('输入分组名称（如 电源控制 / I2C 外设）', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v.trim() ? true : '名称不能为空'),
    })
    store.addGroup(value)
  } catch {
    /* 用户取消 */
  }
}

async function renameGroup(name: string) {
  try {
    const { value } = await ElMessageBox.prompt('输入新的分组名称', '重命名分组', {
      inputValue: name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v.trim() ? true : '名称不能为空'),
    })
    store.renameGroup(name, value)
  } catch {
    /* 用户取消 */
  }
}

async function deleteGroup(name: string) {
  try {
    await ElMessageBox.confirm(
      `删除分组“${name}”？其成员将从分组移除（不影响引脚配置）`,
      '删除分组',
      { type: 'warning' },
    )
    store.deleteGroup(name)
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <div class="groups-panel">
    <div class="groups-head">
      <span>分组（{{ store.groups.length }}）</span>
      <el-button size="small" type="primary" plain @click="addGroup">新建</el-button>
    </div>
    <div v-if="store.groups.length" class="group-list">
      <div v-for="g in store.groups" :key="g.name" class="group-row">
        <i class="swatch" :style="{ background: g.color ?? '#999' }" />
        <span class="group-name">{{ g.name }}</span>
        <span class="group-count">{{ g.pins.length }} 引脚</span>
        <el-button size="small" text @click="renameGroup(g.name)">改名</el-button>
        <el-button size="small" text type="danger" @click="deleteGroup(g.name)">删除</el-button>
      </div>
    </div>
    <div v-else class="groups-empty">暂无分组，点击“新建”创建</div>
  </div>
</template>

<style scoped>
.groups-panel {
  padding: 8px 12px;
}
.groups-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.group-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}
.group-name {
  font-weight: 600;
  color: #374151;
}
.group-count {
  color: #9ca3af;
}
.groups-empty {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  padding: 8px 0;
}
</style>
