import { Data } from 'effect'

export class RiotAuthError extends Data.TaggedError('RiotAuthError')<{
  readonly message: string
  readonly status?: number
}> {}
