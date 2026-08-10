import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node', // 纯 Node 环境，不碰 electron 窗口
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup.ts']
  }
})
