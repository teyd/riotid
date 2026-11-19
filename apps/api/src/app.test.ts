import { describe, expect, it } from 'vite-plus/test'

import { makeApp } from './app.ts'

describe('health', () => {
  it('reports the service as healthy', async () => {
    const response = await makeApp().request('/healthz')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, service: 'riotid-api' })
  })
})
