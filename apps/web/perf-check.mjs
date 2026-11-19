import { chromium } from '@playwright/test'

const url = process.env.PERF_URL ?? 'https://riotid.teyd.dev/'
const executablePath = process.env.CHROMIUM_PATH || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.addInitScript(() => {
  window.__perf = { lcp: 0, fcp: 0, cls: 0, longTasks: [] }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') window.__perf.fcp = entry.startTime
    }
  }).observe({ type: 'paint', buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.cls += entry.value
  }).observe({ type: 'layout-shift', buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.longTasks.push(entry.duration)
  }).observe({ type: 'longtask', buffered: true })
})

const started = Date.now()
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('button[data-selected]', { timeout: 20_000 })
const ready = Date.now() - started

const navigation = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const resources = performance.getEntriesByType('resource')
  const index = resources.find((entry) => entry.name.includes('/api/v1/index'))

  return {
    dcl: nav.domContentLoadedEventEnd,
    load: nav.loadEventEnd,
    perf: window.__perf,
    index: index
      ? {
          start: index.startTime,
          duration: index.duration,
          encoded: index.encodedBodySize,
          decoded: index.decodedBodySize,
        }
      : null,
    js: resources
      .filter((entry) => entry.name.endsWith('.js'))
      .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize), 0),
    nodes: document.getElementsByTagName('*').length,
    rows: document.querySelectorAll('button[data-selected]').length,
  }
})

const keyMs = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const start = performance.now()
      let previous = document.querySelector('button[data-selected="true"]')
      const observer = new MutationObserver(() => {
        const current = document.querySelector('button[data-selected="true"]')
        if (current && current !== previous) {
          observer.disconnect()
          resolve(performance.now() - start)
        }
        previous = current
      })
      observer.observe(document.body, { subtree: true, attributes: true, childList: true })
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }))
      setTimeout(() => {
        observer.disconnect()
        resolve(-1)
      }, 2000)
    }),
)

const searchMs = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const input = document.querySelector('input[placeholder^="Search name"]')
      if (!input) return resolve(-1)
      const start = performance.now()
      let previous = document.querySelectorAll('button[data-selected]').length
      const observer = new MutationObserver(() => {
        const current = document.querySelectorAll('button[data-selected]').length
        if (current !== previous) {
          observer.disconnect()
          resolve(performance.now() - start)
        }
        previous = current
      })
      observer.observe(document.body, { subtree: true, childList: true })
      input.value = 'zzzz-not-found'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      setTimeout(() => {
        observer.disconnect()
        resolve(-1)
      }, 3000)
    }),
)

console.log(JSON.stringify({ ready, ...navigation, keyMs, searchMs }, null, 2))
await browser.close()
