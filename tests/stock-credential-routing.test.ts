import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('stock credential routing', () => {
  it('reads local credentials through the Electron bridge instead of the cloud API wrapper', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/renderer/src/pages/StockMarketPage.tsx'),
      'utf8',
    )

    expect(source).toContain('window.api.invoke(IPC_CHANNELS.CREDENTIAL_GET)')
    expect(source).not.toMatch(/(?<!window\.api\.)invoke\(IPC_CHANNELS\.CREDENTIAL_GET\)/)
  })
})
