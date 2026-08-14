#!/usr/bin/env node
'use strict'

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const python = process.platform === 'win32' ? 'python' : 'python3'
const checks = [
  { label: '本地数据库', script: 'verify-local', command: process.execPath, args: ['scripts/verify/verify-local.js'] },
  { label: '云端 API', script: 'verify-cloud', command: python, args: ['scripts/verify/verify-cloud.py'], allowSkip: true },
  { label: 'UI 静态检查', script: 'verify-ui', command: process.execPath, args: ['scripts/verify/verify-ui.js'] },
]

console.log(`项目根目录: ${ROOT}\n`)

const results = checks.map((check) => {
  const result = spawnSync(check.command, check.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  if (result.error) {
    console.error(`[FAIL] 无法启动 ${check.script}: ${result.error.message}`)
    return { ...check, code: 1 }
  }
  const code = result.status == null ? 1 : result.status
  return { ...check, code: code === 2 && check.allowSkip ? 2 : code }
})

console.log('\n══════════════════════════════════════════')
console.log('  验证汇总')
console.log('══════════════════════════════════════════')
let failed = false
for (const result of results) {
  const status = result.code === 0 ? 'PASS' : result.code === 2 ? 'SKIP' : 'FAIL'
  if (status === 'FAIL') failed = true
  console.log(`  ${result.label.padEnd(12)} (${result.script}) ${status}`)
}

console.log(`\n总体: ${failed ? 'FAIL（存在未通过的检查，详情见上方输出）' : 'PASS'}`)
process.exit(failed ? 1 : 0)
