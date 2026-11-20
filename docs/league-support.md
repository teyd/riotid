# League support

Status: design note, not implemented. This generalizes to any Riot title; League is
the first second title.

## Summary

- One Riot account is one `players` row. PUUID and Riot ID are account-wide, so
  Valorant and League join for free: no name matching, no cross-game heuristics.
- Treat the game as a dimension (`title`), not a boolean. Art, region scope, ban
  state, season, queue, and crawl scope hang off `(puuid, title)`.
- League needs no player session, but it does need a Riot API key. The official
  `league-v4` apex endpoints are the stable path; the client-edge ladder endpoint
  needs a summoner-scoped JWT and is not a production crawler.
- League entries carry `puuid`, so the anonymous-row and match-graph pipeline
  stays Valorant-only and does not grow.
- Do not merge indexes or banners. Keep the account header shared, split the
  rest by title, and keep Valorant as the default view.

## Why the account join is free

Both games return the same PUUID for an account, and the Riot ID
(`gameName#tagLine`) is account-wide. The current key is already right:

- `players.puuid` primary key and `/players/:puuid` route.
- `player_names` is account history and stays shared: a Riot ID change in League
  is the same event in Valorant.
- `anonymous_rows`, `identity_links`, `match_candidates`, and
  `leaderboard_seeds` remain Valorant-only.

Do not add a `league_players` table keyed by summoner ID. `summonerId` is
platform-scoped and is not the durable account key.

## a) Access: public, but credentialed

League has a documented Riot API, unlike the Valorant PD endpoints used today.

|              | Valorant (today)                                 | League                                                                                               |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Auth         | Riot client cookies and entitlements; QR re-auth | `X-Riot-Token` API key                                                                               |
| Ladder       | `pd.{region}.a.pvp.net/mmr/v1/leaderboards/...`  | `{platform}.api.riotgames.com/lol/league/v4/{challenger,grandmaster,master}leagues/by-queue/{queue}` |
| Row identity | often anonymous                                  | `puuid` on every entry                                                                               |
| Ban flag     | `IsBanned` per row                               | none                                                                                                 |
| Scope        | 4 affinities (`na/eu/ap/kr`)                     | 15+ platforms (`na1/euw1/eun1/kr/br1/jp1/...`)                                                       |
| Limits       | client session budget                            | key limits (dev: 20 req/s, 100 req/2min)                                                             |

Consequences:

- No QR or cookie work for League. Add a separate `LeagueSource` with its own
  HTTP client and key; do not thread `AuthSession` through it.
- **Dev keys expire after 24 hours**, so they cannot back an unattended
  scheduler. A production key needs an application and review. This is the main
  operational decision. Reusing the client edge (`lol-ranked/v1/apex-leagues/...`)
  avoids the key, but it needs a summoner-scoped JWT that the plain client
  session does not satisfy. That path is undocumented; treat it as a personal-use
  fallback, never the production path.
- Entries carry `puuid`, so insert players directly and skip the anonymous
  queue. Identity cost for League is zero.
- There is no public League ban signal. Do not infer bans from ladder absence:
  Master has no fixed size, and decay, demotion, and transfers all remove
  entries. Ban history stays a Valorant fact; label it that way in the UI.

### Names are the hidden cost

`league-v4` returns no Riot ID. Test whether the existing batched Valorant name
service (`PUT /name-service/v2/players`, 10,000 PUUIDs per call) resolves
League-only accounts; if it does, naming is nearly free. If not, the official
fallback is `account-v1` per PUUID, which is one request per player and changes
the crawl budget. Lazy enrichment is the third option: list rows stay nameless
until a backfill or detail view resolves them.

## b) Scale: apex only, and that is the ceiling

The League API does not expose the full ranked population. It exposes the apex
of each platform and queue:

- Challenger: capped at 300 per platform and queue.
- Grandmaster: capped at 700.
- Master: uncapped, and dominates the row count.
- Queues: `RANKED_SOLO_5x5` (ship this) and `RANKED_FLEX_SR` (skip initially).

So the crawl is bounded by the Master population, not all League players. Across
15+ platforms that is still tens of thousands of rows per queue, versus a few
thousand in the four Valorant affinities. Request count is small (three
endpoints per platform and queue); payload size and diff/upsert cost are the
real expense.

The part that is "far bigger" is the part you cannot get: Iron through Diamond.
If the product requires the full League ladder, official APIs cannot deliver it
at any budget.

### Index

The client-side index has a 1.5 MB gzip budget and today ships every public
player. League cannot join that artifact. Split by title and scope:

- `GET /api/v1/index` stays the Valorant index, with unchanged client behavior.
- `GET /api/v1/index?title=league&platform=EUW1` returns that platform's apex
  rows, cached per key.
- The UI adds a title switch and, for League, a platform selector. Instant
  search still works within the selected platform.
- Add a `titles` bit to the Valorant index tuple (`1 = Valorant`, `2 = League`)
  so a Valorant row can show an "also on League" chip without a second request.
  This is a tuple change: bump `indexFormat` and the contract together.
- Detail stays one request per PUUID and returns both titles. Cross-game
  visibility works even though lists are split.

### Storage and runs

- One row per player per title. Do not store rank or LP history; store a current
  entry per `(puuid, title, queue)` if the UI wants tier filters, and overwrite
  it each run.
- Add `title` to `runs` and make the single-running lock per title, so a League
  crawl does not block a Valorant scan. Add `title` to `seasons`; League splits
  are not in the API, so seed them like acts, twice a year.
- Separate scheduler cadence: daily for League apex, existing interval for
  Valorant. Separate budget counters.
- League payloads are large. Parse, diff, and upsert in one transaction per run,
  as today. Watch WAL growth during the first full import and size backups for
  the larger database.

## c) Presentation: one account, two titles

There is no common banner. Valorant has wide player cards; League has a square
profile icon plus a tier emblem. Do not force one into the other's frame.

- Shared account header: Riot ID, tag, PUUID, name history, first and last seen.
- Per title: art, region or platform, ban state, apex tier, season. Use tabs or
  stacked sections, not a merged hero.
- Default title: store an explicit `players.primary_title` (rule: most recent
  activity, tie goes to Valorant; operator override). Do not infer it per render,
  or cached HTML and OG images will disagree.
- List row: one row per account with `VAL` / `LoL` chips. The thumbnail is the
  primary title's art; the other title is a small badge. A split tile is
  unreadable at 28–56 px.
- Ban badge is per title. "Banned" with no qualifier is wrong once both games
  exist; show "Valorant ban" and never imply League status.
- League art: profile icon by `profileIconId` (Data Dragon or CommunityDragon)
  plus the tier emblem. Skip champion splash: it needs match data the apex crawl
  does not fetch.

## Schema sketch

```text
players                  account: puuid PK, name, tag, primary_title, account counters
player_titles            (puuid, title) PK: region_scope, art_id, is_banned,
                         first/last_seen, times_seen
player_names             unchanged, account-wide
player_regions           + title; open unique (puuid, title)
banned_players           + title; open unique (puuid, title); evidence stays 'leaderboard'
seasons                  + title, queue; synthetic ids for League splits
runs                     + title; running unique per title
run_regions              + title; region widens to platform codes
current_entries          (puuid, title, queue) PK: tier, division, lp, wins, observed_at
leaderboard_seeds        unchanged, Valorant identity only
anonymous_rows / links   unchanged, Valorant identity only
```

`players.card_id`, `players.region`, `players.is_banned`, and the region and ban
counters move to `player_titles`. `nameChanges` stays account-level. SQLite
cannot alter the existing check constraints in place; expect a table rebuild in
the migration.

Migration order:

1. Add `title` with a default of `valorant`, backfill, make it non-null. Behavior
   must not change; the existing tests are the gate.
2. Add `player_titles` and move art, region, and ban reads to it. Keep the
   `players` columns until the read model is switched.
3. Add the League source, ingest job, and runs. Direct PUUID upsert only.
4. Widen contracts and the index; add the title and platform selector.
5. Drop the moved `players` columns.

## Non-goals

- Full League ranked population: not exposed by the API.
- League ban detection: no public signal.
- Merged cross-game banner: no shared art.
- TFT and 2XKO: the title dimension makes them additive, but they do not belong
  in this change.
