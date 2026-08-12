/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import type { Plugin } from 'vite'

const stub = fileURLToPath(new URL('./src/lib/node-stub.ts', import.meta.url))
const bridgeScript = fileURLToPath(new URL('./scripts/jlc/bridge-server.mjs', import.meta.url))

/**
 * 开发模式自动拉起本地嘉立创桥：
 * 已有实例在跑时新实例会单例退出复用，Vite 退出时回收子进程。
 */
function jlcBridgePlugin(): Plugin {
  let child: ReturnType<typeof spawn> | null = null
  let closing = false
  return {
    name: 'jlc-bridge',
    configureServer(server) {
      try {
        child = spawn(process.execPath, [bridgeScript], {
          // 用 ignore 避免子进程持有父进程 stdout 管道：
          // 否则 vite-node 脚本模式（如 verify-build）会因桥进程未退出而挂起
          stdio: 'ignore',
          // detached + unref：桥独立运行，不占用父进程事件循环，
          // 否则 vite-node 执行完脚本后进程无法退出（桥未启动时会一直挂起）
          detached: true,
          windowsHide: true,
        })
        child.unref()
        child.on('exit', () => {
          child = null
        })
        console.log('[jlc-bridge] 本地桥已自动启动（npm run dev）')
      } catch (err) {
        console.error('[jlc-bridge] 启动失败:', err instanceof Error ? err.message : String(err))
      }
      return () => {
        const cleanup = () => {
          if (closing) return
          closing = true
          if (child && !child.killed) child.kill()
        }
        server.httpServer?.once('close', cleanup)
        process.once('exit', cleanup)
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), jlcBridgePlugin()],
  resolve: {
    alias: {
      // ejs 在浏览器端仅用 client:true 编译模板，fs/path 只被惰性引用；提供空 stub 避免运行时加载 node 内置模块
      fs: stub,
      path: stub,
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
