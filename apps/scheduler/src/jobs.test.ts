// @effect-diagnostics nodeBuiltinImport:off globalDate:off
import { spawn } from 'node:child_process'
import { once } from 'node:events'

import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { stopChild } from './jobs.ts'

const waitForSpawn = (child: ReturnType<typeof spawn>) =>
  new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve())
    child.once('error', reject)
  })

describe('stopChild', () => {
  it('sends SIGTERM and waits for the child to exit', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
      stdio: 'ignore',
    })
    await waitForSpawn(child)

    await Effect.runPromise(stopChild(child, 2_000))

    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    const child = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)"],
      { stdio: 'ignore' },
    )
    await waitForSpawn(child)
    await new Promise((resolve) => setTimeout(resolve, 100))

    const started = Date.now()
    await Effect.runPromise(stopChild(child, 250))

    expect(Date.now() - started).toBeGreaterThanOrEqual(200)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })

  it('resolves immediately for a child that already exited', async () => {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' })
    await once(child, 'exit')

    await Effect.runPromise(stopChild(child, 1_000))
    expect(child.exitCode).toBe(0)
  })
})
