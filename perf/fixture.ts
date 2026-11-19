import type { PlayerDetail, Region, SiteIndex } from '../packages/contracts/src/index.ts'

const PLAYERS = 35_000
const CARDS = 24
const SEASON_START = Date.UTC(2026, 0, 10)
const NOW = Date.UTC(2026, 10, 19)

const REGIONS = ['na', 'eu', 'ap', 'kr'] as const satisfies ReadonlyArray<Region>

const hex = (value: number, width: number) => value.toString(16).padStart(width, '0')

// A stable LCG: every bench block gets the same index, so runs only differ by build.
const random = (seed: { value: number }) => {
  seed.value = (seed.value * 1_664_525 + 1_013_904_223) >>> 0
  return seed.value / 0x1_0000_0000
}

const pick = <T>(seed: { value: number }, values: ReadonlyArray<T>): T =>
  values[Math.floor(random(seed) * values.length)]!

const cards = Array.from(
  { length: CARDS },
  (_, index) => `${hex(index + 1, 8)}-0000-4000-8000-${hex(index, 12)}`,
)

const index = (): SiteIndex => {
  const seed = { value: 20_261_119 }
  const players: Array<SiteIndex['players'][number]> = []

  for (let i = 0; i < PLAYERS; i++) {
    const name = `Player ${String(i + 1).padStart(5, '0')}`
    const tag = `${pick(seed, REGIONS).toUpperCase()}${1 + Math.floor(random(seed) * 9)}`
    const region = pick(seed, REGIONS)
    const nameChanges = Math.floor(random(seed) * 5)
    const regionChanges = Math.floor(random(seed) * 3)
    const flags =
      (random(seed) < 0.25 ? 1 : 0) |
      (nameChanges > 0 ? 2 : 0) |
      (regionChanges > 0 ? 4 : 0) |
      (random(seed) < 0.12 ? 8 : 0) |
      (random(seed) < 0.08 ? 16 : 0)
    const firstSeenAt = SEASON_START + Math.floor(random(seed) * 30) * 86_400_000
    const lastSeenAt = NOW - Math.floor(random(seed) * 21) * 86_400_000
    const lastNameChangeAt = nameChanges > 0 ? firstSeenAt + Math.floor(random(seed) * 1e10) : null

    players.push([
      `${hex(i + 1, 8)}-1111-4111-8111-${hex(i * 7919, 12)}`,
      name,
      tag,
      region,
      flags,
      nameChanges,
      regionChanges,
      firstSeenAt,
      lastSeenAt,
      Math.floor(random(seed) * CARDS),
      lastNameChangeAt,
    ])
  }

  return {
    version: 1,
    generatedAt: NOW,
    season: { id: 'e10a1', name: 'Episode 10 Act I', endsAt: NOW + 14 * 86_400_000 },
    stats: {
      players: PLAYERS,
      nameChanges: 79_000,
      regionChanges: 31_000,
      bans: 4_200,
      unbans: 900,
      anonymous: 8_750,
      linked: 26_250,
      unresolved: 3_100,
      lastRunAt: NOW - 3_600_000,
      nextRunAt: NOW + 5 * 3_600_000,
    },
    cards,
    players,
  }
}

let cached: SiteIndex | undefined

export const siteIndex = (): SiteIndex => (cached ??= index())

export const playerDetail = (puuid: string): PlayerDetail => {
  const row = siteIndex().players.find((candidate) => candidate[0] === puuid)
  const name = row?.[1] ?? null
  const tag = row?.[2] ?? null
  const region = row?.[3] ?? null
  const nameChanges = row?.[5] ?? 0
  const regionChanges = row?.[6] ?? 0
  const firstSeenAt = row?.[7] ?? NOW
  const lastSeenAt = row?.[8] ?? NOW
  const cardId = row?.[9] == null ? null : (cards[row[9]] ?? null)

  return {
    player: {
      puuid,
      name,
      tag,
      cardId,
      region,
      isBanned: false,
      isAnonymized: false,
      firstSeenAt,
      lastSeenAt,
      firstSeenRunId: 1,
      lastSeenRunId: 42,
      timesSeen: 42,
      nameChanges,
      regionChanges,
      banCount: 0,
      unbanCount: 0,
      lastNameChangeAt: row?.[10] ?? null,
      lastRegionChangeAt: regionChanges > 0 ? lastSeenAt - 86_400_000 : null,
      lastBanAt: null,
      lastUnbanAt: null,
    },
    names: [],
    regions: [],
    bans: [],
    links: [],
  }
}
