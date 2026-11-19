import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Database, migrateDatabase, writeDatabase } from '@riotid/db'
import { RiotSource, type RiotSourceShape, type AuthSession } from '@riotid/riot'
import { Effect, Layer } from 'effect'

export const migrationsFolder = fileURLToPath(new URL('../../db/drizzle', import.meta.url))

export const session: AuthSession = {
  cookies: {},
  accessToken: 'test',
  idToken: 'test',
  entitlementsToken: 'test',
  region: 'eu',
  puuid: 'seed-account',
  country: 'DE',
  expiresAt: Date.now() + 3_600_000,
}

export const withDatabase = async (
  prefix: string,
  run: (path: string) => Promise<void>,
): Promise<void> => {
  const directory = await fs.mkdtemp(join(tmpdir(), prefix))
  const path = join(directory, 'test.db')

  try {
    await run(path)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

export const runDb = <A>(path: string, effect: Effect.Effect<A, unknown, Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(writeDatabase(path))))

export const migrate = (path: string) => runDb(path, migrateDatabase(migrationsFolder))

export const runWithRiot = <A>(
  path: string,
  source: RiotSourceShape,
  effect: Effect.Effect<A, unknown, Database | RiotSource>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(Layer.mergeAll(writeDatabase(path), Layer.succeed(RiotSource, source))),
    ),
  )

export const withTempDirectory = async (
  prefix: string,
  run: (directory: string, path: string) => Promise<void>,
): Promise<void> => {
  const directory = await fs.mkdtemp(join(tmpdir(), prefix))
  const path = join(directory, 'test.db')

  try {
    await run(directory, path)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
