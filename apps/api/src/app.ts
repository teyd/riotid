import { Hono } from 'hono'

import type { Health } from '@riotid/contracts'

export const makeApp = () => {
  const app = new Hono()

  app.get('/healthz', (c) => c.json({ ok: true, service: 'riotid-api' } satisfies Health))

  return app
}

export type AppType = ReturnType<typeof makeApp>
