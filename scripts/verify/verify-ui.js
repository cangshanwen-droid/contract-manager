#!/usr/bin/env node
/**
 * verify-ui.js - Gipfel 前端静态检查（无构建、纯文本扫描）
 *
 * 检查项：
 *  1. 关键文件存在：LoginPage / StockMarketPage / AccountMonitorPage /
 *     GlobalSearch / AuditLogPanel
 *  2. 无残留 emoji（🔴 🔵 ⚪ 📌 📢 📈）
 *  3. 无 fontSize 9 / 10
 *  4. design-tokens 统一引用：
 *     a. 无内联 `const T = {`（防三套 Token 并行）
 *     b. 使用 `T.` 的文件必须 import design-tokens
 *
 * 退出码：0=全部通过  1=存在失败
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SRC = path.join(ROOT, 'src', 'renderer', 'src')

let passed = 0
let failed = 0

function report(ok, name, detail = '') {
  if (ok) {
    passed++
    console.log(`  [PASS] ${name}`)
  } else {
    failed++
    console.log(`  [FAIL] ${name}`)
    if (detail) console.log(`         ${detail}`)
  }
}

function walk(dir, exts, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full, exts, out)
    else if (exts.includes(path.extname(ent.name))) out.push(full)
  }
  return out
}

const sourceFiles = walk(SRC, ['.tsx', '.ts', '.css', '.html'])
const pageFiles = walk(path.join(SRC, 'pages'), ['.tsx'])
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/')

// ── 1. 关键文件存在 ────────────────────────────────────────────────
console.log('═══ verify-ui.js - 前端静态检查 ═══')
console.log(`扫描目录: ${rel(SRC)}（${sourceFiles.length} 个源文件）`)
console.log('')

const KEY_FILES = [
  ['pages/LoginPage.tsx', '登录页'],
  ['pages/StockMarketPage.tsx', '股票市场页'],
  ['pages/AccountMonitorPage.tsx', '账户监控页'],
  ['components/layout/GlobalSearch.tsx', '全局搜索'],
  ['components/AuditLogPanel.tsx', '审计日志面板']
]
console.log('[1] 关键文件存在')
for (const [p, label] of KEY_FILES) {
  report(fs.existsSync(path.join(SRC, p)), `${label}（${p}）`)
}

// ── 2. 无残留 emoji ────────────────────────────────────────────────
console.log('')
console.log('[2] 无残留 emoji（🔴🔵⚪📌📢📈）')
const EMOJIS = ['🔴', '🔵', '⚪', '📌', '📢', '📈']
const emojiHits = []
for (const f of sourceFiles) {
  const content = fs.readFileSync(f, 'utf8')
  for (const emoji of EMOJIS) {
    if (content.includes(emoji)) emojiHits.push(`${rel(f)}: ${emoji}`)
  }
}
report(
  emojiHits.length === 0,
  `源码无 ${EMOJIS.join(' ')} 残留`,
  emojiHits.length ? `发现 ${emojiHits.length} 处:\n         ${emojiHits.slice(0, 15).join('\n         ')}` : ''
)

// ── 3. 无 fontSize 9/10 ────────────────────────────────────────────
console.log('')
console.log('[3] 无 fontSize 9/10')
const FONT_SIZE_RE = /fontSize\s*:\s*['"]?(?:9|10)\b(?:px)?['"]?/g
const fontHits = []
for (const f of sourceFiles.filter((x) => x.endsWith('.tsx') || x.endsWith('.css'))) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (FONT_SIZE_RE.test(line)) fontHits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 100)}`)
  })
}
report(
  fontHits.length === 0,
  '无 fontSize 9/10',
  fontHits.length ? `发现 ${fontHits.length} 处:\n         ${fontHits.slice(0, 15).join('\n         ')}` : ''
)

// ── 4. design-tokens 统一引用 ──────────────────────────────────────
console.log('')
console.log('[4] design-tokens 统一引用')

// 4a. 无内联 const T = {（三套 Token 并行防护）
const INLINE_T_RE = /const\s+T\s*(:\s*[^=]+)?\s*=\s*\{/
const inlineHits = []
for (const f of sourceFiles) {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    // 去掉行注释，避免注释里的 "const T={}" 误报
    const code = line.replace(/\/\/.*$/, '')
    if (INLINE_T_RE.test(code)) inlineHits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 100)}`)
  })
}
report(
  inlineHits.length === 0,
  '无内联 `const T = {`（token 单一来源）',
  inlineHits.length ? `发现 ${inlineHits.length} 处:\n         ${inlineHits.slice(0, 10).join('\n         ')}` : ''
)

// 4b. 使用 T. 的文件必须 import design-tokens
const missingImport = []
for (const f of sourceFiles.filter((x) => x.endsWith('.tsx') || x.endsWith('.ts'))) {
  const content = fs.readFileSync(f, 'utf8')
  const usesT = /(^|[^.\w])T\s*\./.test(content)
  const importsTokens = /design-tokens/.test(content)
  if (usesT && !importsTokens) missingImport.push(rel(f))
}
report(
  missingImport.length === 0,
  '所有使用 `T.` 的文件均引用 design-tokens',
  missingImport.length ? `缺失引用: ${missingImport.join(', ')}` : ''
)

// 4c. （信息）页面内联 hex 且未引用 tokens -- 仅提示，不判失败
const hexWarn = []
for (const f of pageFiles) {
  const content = fs.readFileSync(f, 'utf8')
  if (!/design-tokens/.test(content) && /#[0-9a-fA-F]{3,8}\b/.test(content)) hexWarn.push(rel(f))
}
if (hexWarn.length) {
  console.log(`  [WARN] 以下页面含内联 hex 颜色且未引用 design-tokens（供人工确认）: ${hexWarn.join(', ')}`)
}

console.log('')
console.log(`结果: ${passed} 通过, ${failed} 失败`)
console.log(failed === 0 ? 'verify-ui: PASS' : 'verify-ui: FAIL')
process.exit(failed === 0 ? 0 : 1)
