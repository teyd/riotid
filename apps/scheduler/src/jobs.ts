// @effect-diagnostics nodeBuiltinImport:off globalDate:off
import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { repoRoot } from '@riotid/config'
import { Data, Effect } from 'effect'

export const cliEntry = join(repoRoot, 'apps/cli/src/main.ts')
export const apiEntry = join(repoRoot, 'apps/api/src/index.ts')

export class JobError extends Data.TaggedError('JobError')<{
  readonly message: string
  readonly command: string
  readonly exitCode: number | null
}> {}

export type CliRunner = {
  readonly run: <A>(args: ReadonlyArray<string>) => Effect.Effect<A | null, JobError>
}

const jsonError = (command: string, cause: unknown) =>
  new JobError({
    message: `cannot parse ${command} output: ${String(cause)}`,
    command,
    exitCode: null,
  })

export const makeCliRunner = (options: { readonly dryRun: boolean }): CliRunner => {
  const run = <A>(args: ReadonlyArray<string>) => {
    if (options.dryRun) {
      return Effect.logInfo(`[dry-run] ${args.join(' ')}`).pipe(Effect.as<A | null>(null))
    }

    const label = args.join(' ')

    return Effect.acquireUseRelease(
      Effect.sync(() =>
        spawn(process.execPath, [cliEntry, ...args], {
          cwd: repoRoot,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ),
      (child) =>
        Effect.callback<A, JobError>((resume) => {
          let stdout = ''

          child.stdout?.setEncoding('utf8')
          child.stderr?.setEncoding('utf8')
          child.stdout?.on('data', (chunk: string) => {
            stdout += chunk
          })
          child.stderr?.on('data', (chunk: string) => {
            process.stderr.write(chunk)
          })

          child.once('error', (cause) => {
            resume(
              Effect.fail(new JobError({ message: String(cause), command: label, exitCode: null })),
            )
          })
          child.once('close', (code) => {
            if (code !== 0) {
              resume(
                Effect.fail(
                  new JobError({
                    message: `${label} exited with ${code}`,
                    command: label,
                    exitCode: code,
                  }),
                ),
              )
              return
            }

            try {
              resume(Effect.succeed(JSON.parse(stdout) as A))
            } catch (cause) {
              resume(Effect.fail(jsonError(label, cause)))
            }
          })
        }),
      (child) =>
        Effect.sync(() => {
          if (child.exitCode === null) child.kill('SIGTERM')
        }),
    )
  }

  return { run }
}
