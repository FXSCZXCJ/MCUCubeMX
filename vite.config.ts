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
          stdio: 'inherit',
          windowsHide: true,
        })
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
