// @effect-diagnostics nodeBuiltinImport:off
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { layer as sqliteLayer } from '@effect/sql-sqlite-node/SqliteClient'
import * as Drizzle from 'drizzle-orm/effect-sqlite-node'
import { migrate } from 'drizzle-orm/effect-sqlite-node/migrator'
import { Context, Effect, Layer } from 'effect'

export class Database extends Context.Service<Database, Drizzle.EffectSQLiteNodeDatabase>()(
  'Database',
) {}

const makeDatabaseLayer = (filename: string, readonly: boolean): Layer.Layer<Database> => {
  if (!readonly) mkdirSync(dirname(filename), { recursive: true })

  return Layer.effect(
    Database,
    Effect.gen(function* () {
      const db = yield* Drizzle.makeWithDefaults()
      yield* db.run('PRAGMA foreign_keys = ON')
      return db
    }),
  ).pipe(
    Layer.provide(
      sqliteLayer({
        filename,
        readonly,
        busyTimeout: '5 seconds',
      }),
    ),
    Layer.orDie,
  )
}

export const readDatabase = (filename: string): Layer.Layer<Database> =>
  makeDatabaseLayer(filename, true)

export const writeDatabase = (filename: string): Layer.Layer<Database> =>
  makeDatabaseLayer(filename, false)

export const migrateDatabase = (migrationsFolder: string): Effect.Effect<void, unknown, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    yield* migrate(db, { migrationsFolder })
  })
