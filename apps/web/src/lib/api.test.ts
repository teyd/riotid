import { describe, expect, it } from 'vite-plus/test'

import { trackerProfileUrl, vtlProfileUrl } from './api.ts'

describe('profile links', () => {
  it('encodes a Riot ID for tracker.gg', () => {
    expect(trackerProfileUrl('goombastomper28', 'teyd')).toBe(
      'https://tracker.gg/valorant/profile/riot/goombastomper28%23teyd/overview',
    )
  })

  it('builds a vtl.lol profile from the puuid', () => {
    expect(vtlProfileUrl('57a2db86-d22a-5c85-9eb7-7dc8dbb1b702')).toBe(
      'https://vtl.lol/id/57a2db86-d22a-5c85-9eb7-7dc8dbb1b702',
    )
  })
})
