import { describe, expect, it } from 'vite-plus/test'

import { copyText } from './clipboard.ts'

describe('copyText', () => {
  it('reports failure when no clipboard is available', async () => {
    await expect(copyText('https://riotid.example/puuid/demo')).resolves.toBe(false)
  })
})
