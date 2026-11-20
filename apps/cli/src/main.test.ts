// @effect-diagnostics nodeBuiltinImport:off
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { seedDatabase } from '@riotid/db'
import { migrate, runDb, withDatabase } from '@riotid/test-utils'
import { describe, expect, it } from 'vite-plus/test'

const exec = promisify(execFile)
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const entry = join(repoRoot, 'apps/cli/src/main.ts')

const runCli = async (
  args: ReadonlyArray<string>,
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number }> => {
  try {
    const result = await exec(process.execPath, [entry, ...args], {
      cwd: repoRoot,
      env: { ...process.env, NODE_ENV: 'development', ...env },
    })
    return { stdout: result.stdout, stderr: result.stderr, code: 0 }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number }
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', code: failure.code ?? 1 }
  }
}

const parseSingleJson = (stdout: string): unknown => {
  const lines = stdout.trim().split('\n')
  expect(lines).toHaveLength(1)
  return JSON.parse(lines[0] ?? '')
}

describe('cli', () => {
  it('prints help with every operator command and exits zero', async () => {
    const { stdout, code } = await runCli(['help'])

    expect(code).toBe(0)

    for (const command of [
      'auth:login',
      'auth:save',
      'auth:check',
      'auth:refresh',
      'probe',
      'db:migrate',
      'db:seed',
      'db:check',
      'db:recover',
      'db:prune',
      'scan',
      'stats',
      'backup',
      'backup:restore',
      'anon:list',
      'anon:resolve',
      'anon:cache',
      'index:rebuild',
      'player:show',
      'player:remove',
      'status',
      'help',
    ]) {
      expect(stdout).toContain(command)
    }
  })

  it('exits with a usage code for unknown commands', async () => {
    const { stderr, stdout, code } = await runCli(['does:not:exist'])

    expect(code).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toContain('Unknown command: does:not:exist')
  })

  it('prints a single JSON document for status without auth or a database', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'riotid-cli-'))

    try {
      const { stdout, stderr, code } = await runCli(['status', '--json'], {
        DATABASE_PATH: join(directory, 'missing', 'riotid.db'),
        COOKIE_FILE: join(directory, 'missing', 'cookies.json'),
        PORT: '8787',
      })

      expect(code).toBe(0)
      expect(stderr).not.toContain('riotid api ready')

      const payload = parseSingleJson(stdout) as {
        port: number
        database: string
        cookieSource: string | null
        stats: unknown
      }

      expect(payload.port).toBe(8787)
      expect(payload.database).toContain('missing/riotid.db')
      expect(payload.cookieSource).toBeNull()
      expect(payload.stats).toBeNull()
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('migrates a fresh nested database path through the CLI', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'riotid-cli-'))
    const path = join(directory, 'fresh', 'nested', 'riotid.db')

    try {
      const { stdout, code } = await runCli(['db:migrate', '--json'], { DATABASE_PATH: path })

      expect(code).toBe(0)
      await expect(fs.stat(path)).resolves.toBeDefined()
      expect(parseSingleJson(stdout)).toMatchObject({ migrated: true, database: path })
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('reports seeded stats and anon totals as JSON', async () => {
    await withDatabase('riotid-cli-', async (path) => {
      await migrate(path)
      await runDb(path, seedDatabase)

      const status = await runCli(['status', '--json'], { DATABASE_PATH: path })
      expect(status.code).toBe(0)

      const payload = parseSingleJson(status.stdout) as {
        stats: { players: number; latestSuccessfulRunAt: number | null }
      }
      expect(payload.stats.players).toBeGreaterThan(0)
      expect(typeof payload.stats.latestSuccessfulRunAt).toBe('number')

      const anon = await runCli(['anon:list', '--json'], { DATABASE_PATH: path })
      expect(anon.code).toBe(0)
      expect(parseSingleJson(anon.stdout)).toMatchObject({
        anonymous: { total: 1 },
        cache: { matches: 0 },
      })
    })
  })

  it('round trips a backup and reports the prune result', async () => {
    await withDatabase('riotid-cli-', async (path) => {
      await migrate(path)
      await runDb(path, seedDatabase)
      const directory = await fs.mkdtemp(join(tmpdir(), 'riotid-cli-backups-'))

      try {
        const backup = await runCli(['backup', '--json'], {
          DATABASE_PATH: path,
          BACKUP_DIRECTORY: directory,
        })
        expect(backup.code).toBe(0)
        expect(parseSingleJson(backup.stdout)).toMatchObject({ bytes: expect.any(Number) })

        const prune = await runCli(['db:prune', '--json'], { DATABASE_PATH: path })
        expect(prune.code).toBe(0)
        expect(parseSingleJson(prune.stdout)).toMatchObject({ deleted: expect.any(Number) })
      } finally {
        await fs.rm(directory, { recursive: true, force: true })
      }
    })
  })
})
