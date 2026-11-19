import { describe, expect, it } from 'vite-plus/test'

import { trackerProfileUrl, vtlProfileUrl } from './api.ts'

describe('profile links', () => {
  it('encodes a Riot ID for tracker.gg', () => {
    expect(trackerProfileUrl('goombastomper28', 'teyd')).toBe(
      'https://tracker.gg/valorant/profile/riot/goombastomper28%23teyd/overview',
    )
  })

  it('builds a vtl.lol profile from the puuid', () => {
    expect(vtlProfileUrl('00000000-0000-4000-8000-000000000001')).toBe(
      'https://vtl.lol/id/00000000-0000-4000-8000-000000000001',
    )
  })
})
