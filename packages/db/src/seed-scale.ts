// @effect-diagnostics globalDate:off
import { eq, like, sql } from 'drizzle-orm'
import { Effect } from 'effect'

import { Database } from './client.ts'
import {
  anonymousRows,
  bannedPlayers,
  identityLinks,
  meta,
  playerNames,
  playerRegions,
  players,
  runs,
  seasons,
} from './schema.ts'

export type ScaleSeedOptions = {
  readonly players?: number
  readonly names?: number
  readonly regionChanges?: number
  readonly seed?: number
  readonly batchSize?: number
}

export type ScaleSeedResult = {
  readonly seeded: true
  readonly players: number
  readonly names: number
  readonly regionChanges: number
  readonly runId: number
  readonly elapsedMs: number
}

// 180 playercard ids sampled from valorant-api.com/v1/playercards.
const cards = [
  '1711d20d-4b1c-c64a-14be-d4ae58a457c6',
  'e8787c31-4a39-9636-94a5-77b298d26ba7',
  '3432dc3d-47da-4675-67ae-53adb1fdad5e',
  'd2b288ea-4dc9-0b3b-fc8c-3baec575f0f8',
  '48ed2529-4295-c37a-eaa1-15a1c4137abe',
  '7aa1a5fb-4ae3-9a3b-ae04-05bd9fc02413',
  'acf37618-43de-2a3e-ccf9-ea9c3cb4dd33',
  '1fb0bee0-49db-fb51-b090-bc834babdb2b',
  '5e9e64d1-4fed-2225-7b9d-5a960470f644',
  '52995983-424c-9517-2fe8-3795e092edb8',
  'da748eff-4571-dee4-45e9-d1829fcacee5',
  'e9368c54-41ba-5d07-f9aa-7f98650e9885',
  '50ee5414-45cc-85f6-2ec8-cb96d86f6039',
  '2950e0cb-414f-09b6-0dbe-45b3595d82e0',
  'da593a51-479e-4800-4cb5-1b8f86d5086e',
  '7b0f9b3f-4ebf-c3b2-8cbe-e2afb79fc5be',
  '0d62fdfb-482e-2ddf-87eb-7ca7c88f222f',
  'e84c7c83-f430-4d6f-b14b-bfdccd80670a',
  '5f5405c9-4604-86b8-57a3-e78e4d184537',
  'c86953ca-4c94-c0f7-fd91-c19e03ff2b9f',
  'e9021053-495a-e500-9f57-b59f2f94d01b',
  '504f38e4-4874-845c-ccb6-a3aec7a3a1eb',
  'e9dcc215-4b83-90e4-ba3b-4f8d32568eb6',
  'faa3c3b5-4b0b-1f20-b383-01b7b83126ff',
  '14a59263-4028-9a76-a65e-c8891387db0c',
  '746af199-4127-119d-2fc2-1baa3ac144f0',
  'e6a07a97-4c48-421f-515e-288379f7a5be',
  '77042842-4d95-54bc-1898-bc8860133f76',
  'b5cacbb5-4249-6f08-2fb5-67b5b9f0e425',
  '00cdb48d-4ebe-1977-2e4f-6296cdb57c4f',
  '8b26fe6c-409e-6ce8-3dc1-50ae5a503805',
  'ea210157-4595-8727-86ae-9490a08a955f',
  '915fbfc2-409c-2288-204e-aeb49a71557e',
  '7dc703c4-43f2-b5df-8f3b-34b14a08cd0b',
  '2a280896-4e81-c319-ffd3-6b8873042647',
  '4727101c-405c-e9eb-5cd6-638f0487dc76',
  '05bfbe92-47c0-650c-7f46-2a8b8443dafc',
  '1b6c643b-4f7e-aed8-88f6-f3932e682c14',
  '24d76e1f-4f62-934b-f811-e096b105b92a',
  '4137dae5-4934-dcf5-36f3-d58f45f063c2',
  'aaad6093-4d27-c053-c53b-9c8a657338d1',
  '8216a64c-4635-9782-4003-17b1b1febce7',
  'c59b3a9b-467b-54b7-3e4d-a0a3107cbefe',
  '7b240a91-4925-8bb6-7812-60b49543e145',
  '8c93837c-435d-d19d-447f-3e8dcd1a6bb8',
  '7b3bfdba-4340-7e05-ef75-17873ed03902',
  'e03ef5d2-4ac2-07f7-c14b-b4bd40c4bf40',
  'e70e685b-4e42-e14b-dbfc-68957b3b914a',
  'fdef838a-40d1-9954-ad6d-588a7a8739f0',
  '12216d1f-4f05-1600-feb1-aebf82a4bc13',
  '6b2bf0c5-4bec-70f4-c63a-54b30a3c65bc',
  'f07f7e19-4478-3bdc-0c09-cf8158aa5426',
  'c9a3b703-4581-7c8d-66ad-ea887c55aa82',
  '0b637c4d-4761-c4ec-abf9-90a749139429',
  '56836d41-4fa5-6051-1c25-3f93b9675dce',
  'eba5be7e-4ec7-753b-8678-fa88da1e46ab',
  '6d30599a-4a4a-5dc0-043e-0aaf39bb83ad',
  'aeb4ce01-4781-9330-43cb-b991d1122c99',
  '37f59255-44da-ade1-facc-06a06be85aa4',
  '2071d51a-4356-1f55-6776-59a32ce91b71',
  '59cb1a87-456b-9b1e-acef-3ca613286339',
  'a34e1432-4c97-ac38-808f-859a7f79f5e6',
  'b3bb210c-4737-e824-80f6-af863b8fffa9',
  '65249a0f-469e-d164-e499-39bac37f63a7',
  'd4e27f78-4234-4db7-ab0d-ec872e748d80',
  '9b63fd5c-4ba1-44f5-af77-aab0cc45e8ed',
  'f26bfcbc-4ca7-81cb-149b-3596d8dbe35c',
  '0b9f3827-4d5b-5512-74fa-04a1b7ccbbff',
  'fb0d94ab-4186-389d-6e8d-439c45e00aa9',
  '3dce9f66-4623-75cc-2179-ba9152dbbb41',
  '4ceb0ae0-4ff1-0772-d5e3-24bc7cc6b2fd',
  '72ccc01e-40a7-cab7-03b6-798b39ae9b30',
  '9c38c6c2-4228-a08c-4d3c-c0a639bd7ca4',
  '199788ce-4254-57f3-6a08-23829a65fc9f',
  '65505e32-4124-7001-fc5f-9a8ad846e68a',
  'adf99573-42d0-185c-df6c-988e47691f0d',
  'cabd47c0-44b9-a3e0-f100-ea87b692dc86',
  '7f957f92-48ae-11de-6671-36930d4e4b95',
  'd05c6fc8-42ee-ac9c-d002-1a90b1f8c9cc',
  'd27c9959-4e3d-33a3-e2c5-c2ba78d7ebd3',
  'b4ccb9df-4731-dfc6-a878-44a6860115f4',
  'b4dd73f0-49ac-cf15-aca3-c8ac950dc0c4',
  '7b75be16-4190-34d5-667c-3589418fc7c5',
  'eaed8ce8-4d64-0758-3355-1ebf5643d1c0',
  'a3b93c7b-440b-ca21-f87d-f88696f0ebd6',
  'e17c2e94-44fb-9486-8497-9dab8b942b3d',
  'bcf9cff4-4163-a536-458d-22b8904876ad',
  'be21f94b-45ea-52b2-40d2-07b999f4a8ed',
  '33910cd9-4ac5-a0e1-8e79-3ca6916af3ef',
  '33f3c143-4da0-b595-5f70-faa2ab7eba3e',
  '508ffe91-4d8e-6a3b-7f69-6a92524760cd',
  '5c8c0089-4d44-a941-a21e-39af06761584',
  'cdf51e51-401a-7d13-7736-9e8ddc0e1694',
  '3f77186a-40a9-7abc-9ac6-5a988d279dad',
  '54d28948-4891-1ef9-8105-d0b27317c10a',
  'e10f88fc-400b-a70f-d608-fca288bf88f6',
  '8dd76058-476f-57a7-0a52-84b307dbf373',
  '584b90b0-4bdc-e9e4-a13f-9eaff115b624',
  'e6436c2d-4ad6-cf49-4dbf-f3b9467afc9f',
  'fdae9f4e-45ea-7f50-af72-2ca6faf8d240',
  '1ec3f3b5-4604-9939-b04a-7cace50fdd4b',
  '5b27d2de-4a97-d6c1-76e7-669189c67072',
  '4dce4142-44bf-32e5-6f51-7e905389502c',
  'd34ee1fb-481d-485f-2f99-2ebc63ec5907',
  '0c05d003-48e9-261b-6155-938cb4b19143',
  '4b4758da-41e0-2e81-322b-0c84697dbf58',
  '39729022-445a-d7bb-52e7-9e909e481db2',
  '9df9aa67-4ff7-988d-cf72-599a7d5fe2bf',
  '2489d19b-4a8c-0e49-685e-9fa58b967ba1',
  '9d5d85fd-4803-15ee-8c45-a3b95f522309',
  '4a3d6565-42c4-c25e-f846-1097e2a109a8',
  '0839ff49-4304-be5e-763e-568d41478ca5',
  'a372c539-41c7-6a41-7064-80a61ccd597b',
  '0abecac7-411f-71c0-9504-2d81df0acd71',
  '068e78f6-4d12-7e0a-76ec-3cb80e157d76',
  '6f812af1-451d-0eab-59fe-93b64c5e2c77',
  '5e5a435f-4a0d-0320-39c9-3fbe8ff65ae2',
  'a0804878-464d-e943-c225-88944f41c986',
  'd33681d4-4168-0107-2b07-a19c57b96e96',
  '1d0fe8d7-42dd-6f77-50b0-798d1ff90bef',
  '5ff3a862-4e89-84dd-6e47-bda2cd2a5cec',
  '8a478f7f-4280-1661-586d-6f9eb5646ea7',
  'd344d2b9-4c29-26dc-8728-d98edc25d61e',
  'da6843a1-40de-aa1b-0c7f-848d6ffb9b39',
  '905a9a30-4ed2-c267-96a1-5987638fd534',
  '1e7d4dfe-4a18-f31c-af8d-b9bd48927d9a',
  '7be17b22-414d-d9c7-02cd-e5bb0d07dc3d',
  '5c0650a3-4f92-3ed1-787b-47ab812bd2c1',
  'e7e71e87-4ce9-6fbb-5f72-e08b59b14d57',
  '8d19590f-4fee-49ef-fe3c-59ae9e1b6263',
  'ad4b0c01-469c-e9aa-2617-76a6b43983c9',
  '7d57e1d7-4be8-24f3-874d-4984714424f1',
  'b0aaf4d6-40f6-300d-6ede-aca5ad5658ab',
  'c636ae53-43d5-6423-6a90-b190156dd922',
  'e510e95d-4fa0-49ff-0982-1398a8410372',
  '7d9f3a76-4a54-189c-14f2-fb928e28f7c6',
  'ba2491f8-48c2-fb9a-d017-53bdf18fb730',
  'd1611832-4265-32b7-34ff-199d4dfbba6b',
  '1bb056ab-4064-e550-9a04-58b963eaa518',
  '065e67f4-4b16-2d5b-49e8-72b53d73e9d4',
  'c06b12b4-4517-5608-3eb9-b1b2d4f57d84',
  '1ce0823c-4399-abdc-8230-ff82727e13ff',
  '79828279-42a3-81e6-ab5f-3a8a0add281d',
  'dc22fa1e-4170-c594-aaa8-73928a9ca81e',
  '201be320-4a18-cd81-75fa-228dba06d676',
  'f682d368-4e99-db38-dcf0-dfb4a96a5e10',
  'd8b4272d-443e-e445-1a0b-44ba411fcde5',
  '38e78d00-4a42-e605-847a-a3a2fc85cbf4',
  'f703173e-45c6-08f9-75a9-968fdf7d6623',
  'da0c1560-4a9d-99cb-f27c-fbb1a1fb65d9',
  '1433f361-4aa5-927a-5923-2abd84e639c0',
  '5f766078-4c91-dedd-6302-e3b7a11e0374',
  '63c8c169-49ed-d35f-3725-e9921dcf4b49',
  '3b9bc827-44d0-442d-8335-5dbced752668',
  '331e7a68-4af0-cff2-7dba-4187228df080',
  'c82aaade-4b61-36d7-cc1f-11b1f9cd6f85',
  '319352c9-4ded-ad5a-2d7c-a38ceeb272be',
  '24335ffe-4eea-7e77-0e17-959a1d132d31',
  'adb00c74-4505-4e29-e359-74adfc0ead87',
  '2b80254c-497d-462b-67f4-f281389defb5',
  '40f33c2d-404b-a9ec-6832-a48011c9e804',
  '13786f78-4993-e893-f491-c28c1758854c',
  'e6565f4f-40d3-2ba4-8d8e-fcabf29859cd',
  '1a050de0-4870-5519-4135-058d6ce6fb8b',
  'b64b4839-4144-c7c7-8b1e-f39cb3806464',
  'bfab82f0-42ca-1fd2-7d32-7ab950e42e8f',
  '176d426b-4f2c-c350-b1ef-6b8b0a0639d2',
  'e6d97ce5-4430-59e5-3e61-29ab7c12cf8e',
  '898c20a4-42a3-7d94-310f-33ac16d7faf6',
  'a0bc1788-40fd-40f8-7ad8-09948a0d86f9',
  '460879ea-4e1a-1f84-7d44-8a921b4277d2',
  'a4279868-4f4c-5ca3-5ead-52aad1a09fe8',
  '89bf1311-403b-cdd9-80f3-859bd3b33c6f',
  '0289ee43-4b12-497f-a972-ec8e293b6c7a',
  '72165290-4c6d-ae1c-5b97-cfa5e91af130',
  'ba476930-4934-1161-c18e-e88a28aec00d',
  'a47307e5-4f61-f36f-53b4-fdb1f8be9f75',
  'd4f4c5fc-4601-ca99-0e3e-63a96cb5b8ae',
  'afde77eb-4bdf-612d-d047-998c1847cd77',
  '95d3bbd1-4cf6-543b-0237-ba876d886210',
] as const

const regions = ['na', 'eu', 'ap', 'kr'] as const
const adjectives = [
  'Ace',
  'Angry',
  'Bold',
  'Brave',
  'Bright',
  'Chill',
  'Clever',
  'Cosmic',
  'Crimson',
  'Crisp',
  'Dizzy',
  'Feral',
  'Frost',
  'Grim',
  'Hollow',
  'Hyper',
  'Iron',
  'Jolly',
  'Lazy',
  'Lucky',
  'Lunar',
  'Mad',
  'Mellow',
  'Mystic',
  'Neon',
  'Nimble',
  'Nova',
  'Old',
  'Prime',
  'Quiet',
  'Rapid',
  'Rogue',
  'Rusty',
  'Salty',
  'Savage',
  'Shady',
  'Silent',
  'Sly',
  'Sneaky',
  'Solar',
  'Spicy',
  'Stormy',
  'Sunny',
  'Swift',
  'Tiny',
  'Toxic',
  'Velvet',
  'Vivid',
  'Wild',
  'Zero',
] as const
const nouns = [
  'Bandit',
  'Baron',
  'Blade',
  'Bulldog',
  'Cipher',
  'Cobra',
  'Comet',
  'Drift',
  'Duke',
  'Echo',
  'Falcon',
  'Fox',
  'Garden',
  'Ghost',
  'Goblin',
  'Guardian',
  'Harbor',
  'Hunter',
  'Jester',
  'Judge',
  'Knight',
  'Koala',
  'Lynx',
  'Mage',
  'Main',
  'Marshal',
  'Meteor',
  'Nomad',
  'Nova',
  'Operator',
  'Orca',
  'Otter',
  'Panda',
  'Phantom',
  'Pilot',
  'Pixel',
  'Raven',
  'Reaper',
  'Rocket',
  'Rogue',
  'Sentinel',
  'Sheriff',
  'Signal',
  'Sniper',
  'Specter',
  'Striker',
  'Tiger',
  'Titan',
  'Vandal',
  'Viper',
  'Wizard',
  'Wolf',
  'Wraith',
  'Ares',
  'Odin',
  'Bucky',
  'Frenzy',
  'Classic',
] as const
const handles = [
  'TenZ',
  's0m',
  'Derke',
  'Boaster',
  'Chronicle',
  'Alfajer',
  'Sayf',
  'Less',
  'Aspas',
  'Demon1',
  'Ethan',
  'f0rsakeN',
  'Jinggg',
  'something',
  'Laz',
  'Meteor',
  'Sacy',
  'Zekken',
  'Marved',
  'crashies',
  'bang',
  'nAts',
  'ScreaM',
  'shahZaM',
  'dapr',
  'SicK',
  'steel',
  'Hiko',
  'nitr0',
  'Elige',
  'Twistzz',
  'ZywOo',
  's1mple',
  'NiKo',
  'device',
  'dupreeh',
  'Magisk',
  'gla1ve',
  'Xyp9x',
  'stavn',
  'cadiaN',
  'TeSeS',
  'sjuush',
  'broky',
  'ropz',
  'KSCERATO',
  'yuurih',
  'arT',
  'chelo',
  'saffee',
  'electroNic',
  'Boombl4',
  'Perfecto',
  'chopper',
  'donk',
  'm0NESY',
  'Snax',
  'KRIMZ',
  'JW',
  'flusha',
  'olofmeister',
  'GeT_RiGhT',
  'f0rest',
  'Xizt',
  'pashaBiceps',
  'NEO',
  'TaZ',
  'Jett',
  'Phoenix',
  'Reyna',
  'Omen',
  'Brimstone',
  'Sova',
  'Cypher',
  'Killjoy',
  'Skye',
  'Yoru',
  'Astra',
  'Kayo',
  'Chamber',
  'Fade',
  'Harbor',
  'Gekko',
  'Deadlock',
  'Iso',
  'Clove',
  'Vyse',
  'Tejo',
  'Waylay',
  'Raze',
] as const
const tagWords = [
  'ttv',
  'uwu',
  'god',
  'pro',
  'ace',
  'goat',
  'lol',
  'omg',
  'sad',
  'kek',
  'wtf',
  'one',
  'old',
  'main',
  'ggs',
] as const
const tagPrefixes: Record<(typeof regions)[number], readonly string[]> = {
  na: ['NA1', 'NA2', 'BR1', 'BR2', 'LAN', 'LAS', '000', '111'],
  eu: ['EUW', 'EUW1', 'EUNE', 'EUN', 'TR1', 'RU1', '000', '111'],
  ap: ['APAC', 'SEA', 'JP1', 'TW2', 'OCE', 'PH2', 'VN2', 'TH2', '000'],
  kr: ['KR1', 'KR2', '000', '111', '0412'],
}
const leetLetters: Record<string, string> = {
  a: '4',
  e: '3',
  i: '1',
  o: '0',
  s: '5',
}
const dayMs = 86_400_000
const seasonUuid = '00000000-0000-4000-8000-000000000003'
const titleId = '00000000-0000-4000-8000-000000000011'
// Riot anonymizes roughly 10-15% of leaderboard entries.
const anonymizedFraction = 0.15

const mulberry32 = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const pick = <T>(list: readonly [T, ...T[]], random: () => number): T =>
  list[Math.floor(random() * list.length)] ?? list[0]

const leet = (value: string): string =>
  value.replace(/[aeios]/g, (letter) => leetLetters[letter] ?? letter)

const stylize = (value: string, random: () => number): string => {
  const roll = random()
  if (roll < 0.1) return value.toUpperCase()
  if (roll < 0.45) return value
  if (roll < 0.85) return value.toLowerCase()
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase()
}

const withDigits = (value: string, random: () => number, max: number): string =>
  random() < 0.3 ? `${value}${String(1 + Math.floor(random() * max))}` : value

const nameFor = (random: () => number): string => {
  const adjective = pick(adjectives, random)
  const noun = pick(nouns, random)
  const roll = random()
  let name: string

  if (roll < 0.08) {
    name = pick(handles, random)
  } else if (roll < 0.32) {
    const base = random() < 0.25 ? leet(noun.toLowerCase()) : noun
    name = withDigits(stylize(base, random), random, 999)
  } else if (roll < 0.6) {
    name = withDigits(stylize(`${adjective}${noun}`, random), random, 99)
  } else if (roll < 0.72) {
    name = `${adjective} ${noun}`
  } else if (roll < 0.82) {
    name = `xX${stylize(noun, random)}Xx`
  } else if (roll < 0.9) {
    name = `its${stylize(noun, random)}`
  } else if (roll < 0.96) {
    name = `${stylize(noun, random)}${stylize(pick(nouns, random), random)}`
  } else {
    name = `${stylize(noun, random)}${String(1 + Math.floor(random() * 2026))}`
  }

  const trimmed = name.slice(0, 16)
  return trimmed.length >= 3 ? trimmed : `${trimmed}${String(1 + Math.floor(random() * 99))}`
}

const tagFor = (random: () => number, region: (typeof regions)[number]): string => {
  const roll = random()

  if (roll < 0.55) return pick(tagPrefixes[region] as readonly [string, ...string[]], random)
  if (roll < 0.8) {
    const length = 3 + Math.floor(random() * 3)
    return String(Math.floor(random() * 10 ** length)).padStart(length, '0')
  }
  if (roll < 0.9) {
    return `${pick(['T', 'X', 'V', 'R'] as const, random)}${String(
      Math.floor(random() * 10_000),
    ).padStart(4, '0')}`
  }
  return pick(tagWords, random)
}

const regionFor = (random: () => number): (typeof regions)[number] => {
  const roll = random()
  if (roll < 0.32) return 'na'
  if (roll < 0.62) return 'eu'
  if (roll < 0.85) return 'ap'
  return 'kr'
}

const nextRegion = (
  current: (typeof regions)[number],
  random: () => number,
): (typeof regions)[number] => {
  const options = regions.filter((region) => region !== current)
  return options[Math.floor(random() * options.length)] ?? 'na'
}

const tenureDays = (random: () => number): number => {
  const roll = random()
  if (roll < 0.05) return 3 + Math.floor(random() * 12)
  if (roll < 0.2) return 14 + Math.floor(random() * 76)
  if (roll < 0.5) return 90 + Math.floor(random() * 270)
  return 360 + Math.floor(random() * 370)
}

const inactiveDays = (random: () => number): number => {
  const roll = random()
  if (roll < 0.8) return Math.floor(random() * 7)
  if (roll < 0.92) return 7 + Math.floor(random() * 23)
  if (roll < 0.97) return 30 + Math.floor(random() * 60)
  return 90 + Math.floor(random() * 150)
}

const buildPastCounts = (
  playerCount: number,
  pastTotal: number,
  random: () => number,
): Uint16Array => {
  const counts = new Uint16Array(playerCount)
  let assigned = 0

  for (let index = 0; index < playerCount; index += 1) {
    let count = 0
    while (count < 6 && random() < 0.5) count += 1
    counts[index] = count
    assigned += count
  }

  const average = Math.floor(pastTotal / playerCount)
  if (average > 0) {
    for (let index = 0; index < playerCount; index += 1) {
      counts[index] = (counts[index] ?? 0) + average
    }
    assigned += average * playerCount
  }

  let delta = pastTotal - assigned
  while (delta > 0) {
    const index = Math.floor(random() * playerCount)
    counts[index] = (counts[index] ?? 0) + 1
    delta -= 1
  }
  while (delta < 0) {
    const index = Math.floor(random() * playerCount)
    const count = counts[index] ?? 0
    if (count > 0) {
      counts[index] = count - 1
      delta += 1
    }
  }

  return counts
}

const buildRegionChangeCounts = (
  playerCount: number,
  changes: number,
  random: () => number,
): Uint8Array => {
  const counts = new Uint8Array(playerCount)
  const doubles = Math.min(Math.floor(changes * 0.08), Math.floor(changes / 2))
  const singles = changes - doubles * 2

  let placed = 0
  while (placed < doubles) {
    const index = Math.floor(random() * playerCount)
    if ((counts[index] ?? 0) === 0) {
      counts[index] = 2
      placed += 1
    }
  }

  placed = 0
  while (placed < singles) {
    const index = Math.floor(random() * playerCount)
    if ((counts[index] ?? 0) === 0) {
      counts[index] = 1
      placed += 1
    }
  }

  return counts
}

export const seedScaleDatabase = (
  options: ScaleSeedOptions = {},
): Effect.Effect<ScaleSeedResult, unknown, Database> =>
  Effect.gen(function* () {
    const started = Date.now()
    const db = yield* Database
    const playerCount = Math.max(1, Math.floor(options.players ?? 500_000))
    const nameCount = Math.max(playerCount, Math.floor(options.names ?? 1_000_000))
    const regionChangeCount = Math.max(
      0,
      Math.min(playerCount, Math.floor(options.regionChanges ?? 50_000)),
    )
    const batchSize = Math.max(50, Math.floor(options.batchSize ?? 500))
    const random = mulberry32(options.seed ?? 42)
    const now = new Date()
    const nowMs = now.getTime()
    const pastTotal = nameCount - playerCount
    const pastCounts = buildPastCounts(playerCount, pastTotal, random)
    const regionChangeCounts = buildRegionChangeCounts(playerCount, regionChangeCount, random)

    const run = yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* tx.delete(anonymousRows).where(eq(anonymousRows.seasonId, seasonUuid))
        yield* tx.delete(players).where(like(players.puuid, 'seed-scale-%'))
        yield* tx.delete(runs).where(eq(runs.clientVersion, 'scale'))

        yield* tx
          .insert(seasons)
          .values({
            uuid: seasonUuid,
            displayName: 'Scale Act',
            type: 'EAresSeasonType::Act',
            startsAt: new Date(nowMs - 400 * dayMs),
            endsAt: new Date(nowMs + 30 * dayMs),
            isActive: true,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: seasons.uuid,
            set: {
              displayName: 'Scale Act',
              startsAt: new Date(nowMs - 400 * dayMs),
              endsAt: new Date(nowMs + 30 * dayMs),
              isActive: true,
              updatedAt: now,
            },
          })

        const insertedRun = yield* tx
          .insert(runs)
          .values({
            status: 'succeeded',
            trigger: 'manual',
            seasonId: seasonUuid,
            clientVersion: 'scale',
            startedAt: new Date(nowMs - 5 * 60_000),
            finishedAt: new Date(nowMs - 60_000),
            durationMs: 4 * 60_000,
            stats: {
              scale: true,
              players: playerCount,
              names: nameCount,
              regionChanges: regionChangeCount,
            },
            updatedAt: now,
          })
          .returning({ id: runs.id })
        const runId = insertedRun[0]?.id

        if (runId === undefined) {
          return yield* Effect.die('failed to insert scale seed run')
        }

        for (let start = 0; start < playerCount; start += batchSize) {
          const end = Math.min(playerCount, start + batchSize)
          const playerBatch: Array<typeof players.$inferInsert> = []
          const nameBatch: Array<typeof playerNames.$inferInsert> = []
          const regionBatch: Array<typeof playerRegions.$inferInsert> = []
          const banBatch: Array<typeof bannedPlayers.$inferInsert> = []
          const anonymousBatch: Array<typeof anonymousRows.$inferInsert> = []
          const linkBatch: Array<
            Omit<typeof identityLinks.$inferInsert, 'anonymousRowId'> & { leaderboardRank: number }
          > = []

          for (let index = start; index < end; index += 1) {
            const puuid = `seed-scale-${String(index).padStart(9, '0')}`
            const region = regionFor(random)
            const tenure = tenureDays(random)
            const inactive = inactiveDays(random)
            const lastSeenAt = nowMs - inactive * dayMs - Math.floor(random() * dayMs)
            const firstSeenAt = lastSeenAt - Math.max(2, tenure) * dayMs
            const span = lastSeenAt - firstSeenAt
            const currentName = nameFor(random)
            const currentTag = tagFor(random, region)
            const pastCount = pastCounts[index] ?? 0
            const changeFractions: number[] = []

            for (let past = 0; past < pastCount; past += 1) {
              changeFractions.push(0.04 + random() * 0.9)
            }
            changeFractions.sort((left, right) => left - right)
            const changeAt = changeFractions.map(
              (fraction) => firstSeenAt + Math.floor(span * fraction),
            )
            const currentNameAt = changeAt[changeAt.length - 1] ?? firstSeenAt

            for (let past = 0; past < pastCount; past += 1) {
              const pastStart = past === 0 ? firstSeenAt : (changeAt[past - 1] ?? firstSeenAt)
              const pastEnd = changeAt[past] ?? lastSeenAt
              nameBatch.push({
                puuid,
                name: nameFor(random),
                tag: tagFor(random, region),
                startedAt: new Date(pastStart),
                endedAt: new Date(pastEnd),
                startedRunId: runId,
                endedRunId: runId,
                updatedAt: now,
              })
            }

            nameBatch.push({
              puuid,
              name: currentName,
              tag: currentTag,
              startedAt: new Date(currentNameAt),
              startedRunId: runId,
              updatedAt: now,
            })

            const regionChanges = regionChangeCounts[index] ?? 0
            const regionHistory: Array<(typeof regions)[number]> = []
            let previousRegion = region
            for (let change = 0; change < regionChanges; change += 1) {
              const next = nextRegion(previousRegion, random)
              regionHistory.unshift(next)
              previousRegion = next
            }
            const regionFractions: number[] = []
            for (let change = 0; change < regionChanges; change += 1) {
              regionFractions.push(0.15 + random() * 0.7)
            }
            regionFractions.sort((left, right) => left - right)
            const regionChangeAt = regionFractions.map(
              (fraction) => firstSeenAt + Math.floor(span * fraction),
            )

            let regionStart = firstSeenAt
            for (let change = 0; change < regionHistory.length; change += 1) {
              const endedAt = regionChangeAt[change] ?? lastSeenAt
              regionBatch.push({
                puuid,
                region: regionHistory[change] ?? region,
                startedAt: new Date(regionStart),
                endedAt: new Date(endedAt),
                startedRunId: runId,
                endedRunId: runId,
                updatedAt: now,
              })
              regionStart = endedAt
            }

            regionBatch.push({
              puuid,
              region,
              startedAt: new Date(regionStart),
              startedRunId: runId,
              updatedAt: now,
            })

            const banRoll = random()
            let banCount = 0
            let unbanCount = 0
            let lastBanAt: number | null = null
            let lastUnbanAt: number | null = null
            let isBanned = false

            if (banRoll < 0.012) {
              const banStart = firstSeenAt + Math.floor(span * (0.3 + random() * 0.4))
              banBatch.push({
                puuid,
                startedAt: new Date(banStart),
                lastSeenAt: new Date(lastSeenAt),
                startedRunId: runId,
                updatedAt: now,
              })
              banCount = 1
              lastBanAt = banStart
              isBanned = true
            } else if (banRoll < 0.022) {
              const banStart = firstSeenAt + Math.floor(span * 0.25)
              const banEnd = firstSeenAt + Math.floor(span * 0.35)
              banBatch.push({
                puuid,
                startedAt: new Date(banStart),
                endedAt: new Date(banEnd),
                lastSeenAt: new Date(banEnd),
                startedRunId: runId,
                endedRunId: runId,
                updatedAt: now,
              })
              banCount = 1
              unbanCount = 1
              lastBanAt = banStart
              lastUnbanAt = banEnd
            } else if (banRoll < 0.024) {
              const firstBanStart = firstSeenAt + Math.floor(span * 0.2)
              const firstBanEnd = firstSeenAt + Math.floor(span * 0.3)
              const secondBanStart = firstSeenAt + Math.floor(span * 0.5)
              banBatch.push(
                {
                  puuid,
                  startedAt: new Date(firstBanStart),
                  endedAt: new Date(firstBanEnd),
                  lastSeenAt: new Date(firstBanEnd),
                  startedRunId: runId,
                  endedRunId: runId,
                  updatedAt: now,
                },
                {
                  puuid,
                  startedAt: new Date(secondBanStart),
                  lastSeenAt: new Date(lastSeenAt),
                  startedRunId: runId,
                  updatedAt: now,
                },
              )
              banCount = 2
              unbanCount = 1
              lastBanAt = secondBanStart
              lastUnbanAt = firstBanEnd
              isBanned = true
            }

            const cardId = pick(cards, random)
            const isAnonymized = random() < anonymizedFraction

            playerBatch.push({
              puuid,
              name: currentName,
              tag: currentTag,
              cardId,
              region,
              isBanned,
              isAnonymized,
              firstSeenAt: new Date(firstSeenAt),
              lastSeenAt: new Date(lastSeenAt),
              firstSeenRunId: runId,
              lastSeenRunId: runId,
              timesSeen: Math.max(
                2,
                Math.min(500, Math.round((span / dayMs / 7) * (0.5 + random() * 1.5))),
              ),
              nameChanges: pastCount,
              regionChanges,
              banCount,
              unbanCount,
              lastNameChangeAt: pastCount > 0 ? new Date(currentNameAt) : null,
              lastRegionChangeAt:
                regionChangeAt.length > 0
                  ? new Date(regionChangeAt[regionChangeAt.length - 1] ?? firstSeenAt)
                  : null,
              lastBanAt: lastBanAt === null ? null : new Date(lastBanAt),
              lastUnbanAt: lastUnbanAt === null ? null : new Date(lastUnbanAt),
              updatedAt: now,
            })

            if (isAnonymized) {
              const leaderboardRank = index + 1
              const fingerprint = {
                leaderboardRank,
                rankedRating: 600 + (index % 400),
                numberOfWins: 40 + (index % 200),
                competitiveTier: 24 + (index % 3),
                cardId,
                titleId,
              }

              anonymousBatch.push({
                region,
                seasonId: seasonUuid,
                ...fingerprint,
                resolvedPuuid: puuid,
                status: 'linked',
                firstSeenAt: new Date(firstSeenAt),
                lastSeenAt: new Date(lastSeenAt),
                updatedAt: now,
              })
              linkBatch.push({
                leaderboardRank,
                puuid,
                region,
                seasonId: seasonUuid,
                matchId: `seed-scale-match-${index}`,
                method: 'match_graph',
                confidence: 9_995,
                evidence: fingerprint,
                updatedAt: now,
              })
            }
          }

          yield* tx.insert(players).values(playerBatch)
          yield* tx.insert(playerNames).values(nameBatch)
          if (regionBatch.length > 0) yield* tx.insert(playerRegions).values(regionBatch)
          if (banBatch.length > 0) yield* tx.insert(bannedPlayers).values(banBatch)
          if (anonymousBatch.length > 0) {
            const inserted = yield* tx
              .insert(anonymousRows)
              .values(anonymousBatch)
              .returning({ id: anonymousRows.id, leaderboardRank: anonymousRows.leaderboardRank })
            const idByRank = new Map(inserted.map((row) => [row.leaderboardRank, row.id]))

            yield* tx.insert(identityLinks).values(
              linkBatch.map(({ leaderboardRank, ...link }) => {
                const anonymousRowId = idByRank.get(leaderboardRank)
                if (anonymousRowId === undefined) {
                  throw new Error(`missing anonymous row for scale rank ${leaderboardRank}`)
                }
                return { ...link, anonymousRowId }
              }),
            )
          }
        }

        yield* tx
          .insert(meta)
          .values([
            { key: 'latestSuccessfulRunId', value: String(runId), updatedAt: now },
            {
              key: 'seed:scale',
              value: JSON.stringify({ players: playerCount, names: nameCount }),
              updatedAt: now,
            },
          ])
          .onConflictDoUpdate({
            target: meta.key,
            set: { value: sql`excluded.value`, updatedAt: now },
          })
        yield* tx
          .insert(meta)
          .values({ key: 'indexVersion', value: '1', updatedAt: now })
          .onConflictDoUpdate({
            target: meta.key,
            set: {
              value: sql`cast(${meta.value} as integer) + 1`,
              updatedAt: now,
            },
          })

        return runId
      }),
    )

    return {
      seeded: true,
      players: playerCount,
      names: nameCount,
      regionChanges: regionChangeCount,
      runId: run,
      elapsedMs: Date.now() - started,
    }
  })
