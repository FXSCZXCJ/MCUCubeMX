/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const stub = fileURLToPath(new URL('./src/lib/node-stub.ts', import.meta.url))

export default defineConfig({
  plugins: [vue()],
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
