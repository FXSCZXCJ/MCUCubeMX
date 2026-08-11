/**
 * 开发模式一键启动：Vite + 嘉立创 Bridge Server。
 *
 * bridge-server 内置单例检测：如果已有实例在运行，新实例会立即退出并复用现有实例，
 * 因此本脚本可以安全地重复执行。
 */
import { spawn } from 'node:child_process'

const children = []
let stopping = false

function run(name, args) {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
  })
  children.push(child)
  child.on('error', (err) => {
    console.error(`[dev-all] ${name} 启动失败: ${err.message}`)
    shutdown(1)
  })
  return child
}

function shutdown(code) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const bridge = run('bridge', ['scripts/jlc/bridge-server.mjs'])
const vite = run('vite', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'])

// 桥退出码 0 表示“已有实例在运行”或正常停止，不影响 vite；
// vite 退出则整个开发环境结束。
bridge.on('exit', (code) => {
  if (code !== 0) shutdown(code ?? 1)
})
vite.on('exit', (code) => shutdown(code ?? 0))
