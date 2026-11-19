// @effect-diagnostics nodeBuiltinImport:off globalDate:off
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vite-plus/test'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const entry = join(repoRoot, 'apps/scheduler/src/main.ts')

const runSupervisor = () =>
  new Promise<{ readonly code: number | null; readonly output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        SCHEDULER_DRY_RUN: 'true',
        SCHEDULER_JOBS: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let signaled = false
    const stop = () => {
      if (signaled) return
      signaled = true
      child.kill('SIGTERM')
    }
    const timer = setTimeout(stop, 10_000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      if (output.includes('[dry-run] node')) stop()
    })
    child.stderr.on('data', (chunk: string) => {
      output += chunk
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })

describe('scheduler supervisor', () => {
  it('supervises the API without jobs and exits zero on SIGTERM', async () => {
    const result = await runSupervisor()

    expect(result.output).toContain('scheduler starting')
    expect(result.output).toContain('[dry-run] db:migrate --json')
    expect(result.output).toContain('[dry-run] node')
    expect(result.output).not.toContain('scan --json')
    expect(result.output).toContain('scheduler stopping (SIGTERM)')
    expect(result.output).toContain('scheduler stopped (exit 0)')
    expect(result.code).toBe(0)
  }, 15_000)
})
