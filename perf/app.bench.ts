import { Buffer } from 'node:buffer'

import { bench, web } from '@hona/strobe'

import { playerDetail, siteIndex } from './fixture.ts'

// The virtualized list's scroll container; the page has no stable id for it.
const list = 'section[aria-labelledby="player-list-heading"] .overflow-y-auto'

const PIXEL = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
)

export default bench({
  targets: {
    app: web({
      url: '/',
      prepare: async (ctx) => {
        const origin = new URL(ctx.url).origin
        const index = siteIndex()

        await ctx.mock(`${origin}/api/v1/index`, () => ({ body: index }))
        await ctx.mock(`${origin}/api/v1/players/*`, (request) => ({
          body: playerDetail(request.url.split('/').pop() ?? ''),
        }))
        await ctx.mock('https://media.valorant-api.com/*', () => ({
          headers: { 'content-type': 'image/png' },
          body: PIXEL,
        }))
      },
    }),
  },
  async setup({ page }) {
    await page.waitFor('[data-player-row]')
    await page.idle()
  },
  cases: {
    load: {
      primary: 'launch.ready',
      launch: { until: '[data-player-row]' },
    },
    scroll: {
      primary: 'main.work',
      metrics: ['dom.nodes'],
      run: ({ page }) => page.scroll(list, { by: 8_000, speed: 8_000 }),
      reset: ({ page }) => page.scroll(list, { by: -8_000, speed: 8_000 }),
    },
    search: {
      primary: 'main.work',
      metrics: ['dom.nodes'],
      run: ({ page }) => page.type('input[aria-label="Search players"]', 'player 0', { delay: 0 }),
      reset: async ({ page }) => {
        await page.press('ControlOrMeta+a', { selector: 'input[aria-label="Search players"]' })
        await page.press('Backspace')
        await page.waitFor('[data-player-row]')
      },
    },
  },
})
