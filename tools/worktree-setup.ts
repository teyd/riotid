import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

const [sourceRoot, webPortArg, apiPortArg] = process.argv.slice(2)

if (!sourceRoot || !webPortArg || !apiPortArg) {
  console.error('usage: worktree-setup.ts <primary-worktree> <web-port> <api-port>')
  process.exit(1)
}

const root = process.cwd()
const webPort = Number(webPortArg)
const apiPort = Number(apiPortArg)

for (const [name, port] of [
  ['web', webPort],
  ['api', apiPort],
] as const) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`worktree-setup: invalid ${name} port ${port}`)
    process.exit(1)
  }
}

for (const name of ['.env', '.env.local']) {
  const source = join(sourceRoot, name)
  const target = join(root, name)
  if (existsSync(source) && !existsSync(target)) {
    copyFileSync(source, target)
  }
}

writeFileSync(
  join(root, '.env.worktree'),
  `PORT=${apiPort}\nWEB_PORT=${webPort}\nPUBLIC_ORIGIN=http://localhost:${webPort}\n`,
)

const sourceData = join(sourceRoot, 'data')
const targetData = join(root, 'data')

if (existsSync(sourceData)) {
  mkdirSync(targetData, { recursive: true, mode: 0o700 })

  const sourceDb = join(sourceData, 'riotid.db')
  const targetDb = join(targetData, 'riotid.db')
  if (existsSync(sourceDb) && !existsSync(targetDb)) {
    const db = new DatabaseSync(sourceDb)
    try {
      await backup(db, targetDb)
    } finally {
      db.close()
    }
  }

  const sourceCookies = join(sourceData, 'cookies.json')
  const targetCookies = join(targetData, 'cookies.json')
  if (existsSync(sourceCookies) && !existsSync(targetCookies)) {
    copyFileSync(sourceCookies, targetCookies)
    chmodSync(targetCookies, 0o600)
  }

  const sourceBackups = join(sourceData, 'backups')
  const targetBackups = join(targetData, 'backups')
  if (existsSync(sourceBackups) && !existsSync(targetBackups)) {
    await cp(sourceBackups, targetBackups, { recursive: true, preserveTimestamps: true })
  }
}

if (!existsSync(join(root, 'node_modules', '.modules.yaml'))) {
  console.log('worktree-setup: installing dependencies')
  const install = spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
    stdio: 'inherit',
  })
  if (install.status !== 0) {
    console.error('worktree-setup: pnpm install failed')
    process.exit(install.status ?? 1)
  }
}

console.log(`worktree-setup: web http://localhost:${webPort} · api http://localhost:${apiPort}`)
