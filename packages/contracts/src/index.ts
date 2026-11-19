import { Schema } from 'effect'

export const Health = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.String,
})

export type Health = typeof Health.Type
