# Cubs Farcaster Bot

An automated bot that posts Chicago Cubs game recaps, news, and odds updates to the [/cubs](https://warpcast.com/~/channel/cubs) channel on Farcaster. Built with Next.js and deployed on Vercel.

## What it does

- **Game recaps** — Posts box score casts with native inline highlight video after every Cubs game
- **News** — Surfaces significant Cubs news articles from MLB.com, filtered by a keyword-based scoring system
- **Odds** — Weekly Polymarket odds updates for World Series and NL Central, with week-over-week deltas

## Architecture

```
Vercel Cron
  ├── /api/cron/check-games    (every 5 min)
  ├── /api/cron/check-news     (every 2 hours)
  ├── /api/cron/check-odds     (Mondays 2 PM UTC)
  ├── /api/cron/check-clinch   (hourly)
  └── /api/cron/check-series-preview (every 15 min)
         │
         ▼
  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
  │  MLB Stats   │    │  Farcaster   │    │   Upstash Redis  │
  │  API + RSS   │    │  Client API  │    │   (dedup + state)│
  └─────────────┘    └──────────────┘    └──────────────────┘
                            │
                     ┌──────┴──────┐
                     │  Neynar SDK │  (text-only casts)
                     │  FC API     │  (video casts)
                     └─────────────┘
```

### Two posting paths

| Cast type | API used | Why |
|-----------|----------|-----|
| Text / photo / link | Neynar SDK | Standard cast publishing via signer |
| Video | Farcaster Client API (`POST /v2/casts`) | Neynar's unfurler can't classify `stream.farcaster.xyz` URLs as video — only Farcaster's own API does |

### Video pipeline

1. Download MLB highlight mp4
2. Authenticate with Farcaster Client API (EIP-191 signed `generateToken` via custody mnemonic)
3. `POST /v1/prepare-video-upload` to get a TUS upload endpoint
4. Upload via TUS protocol (POST creation + PATCH data to Cloudflare Stream)
5. Poll `/v1/uploaded-video` until processing completes
6. Wait 15s for Farcaster's embed classifier to index the video
7. Post cast with `stream.farcaster.xyz` m3u8 URL — renders as native inline video

## API Routes

### Cron (automated)

| Route | Schedule | Description |
|-------|----------|-------------|
| `/api/cron/check-games` | Every 5 min | Checks today's and yesterday's schedule for final Cubs games. Uploads highlight video and posts box score cast. Retries up to 12 times (1 hour) waiting for highlight availability. |
| `/api/cron/check-news` | Every 2 hours | Fetches Cubs RSS feed, scores articles by significance (0-100), posts articles scoring >= 50. Filters out trivia, podcasts, and sweepstakes. |
| `/api/cron/check-odds` | Mondays 2 PM UTC | Fetches Cubs World Series and NL Central odds from Polymarket. Posts weekly update with deltas. Cross-posts to Twitter. |
| `/api/cron/check-clinch` | Hourly | Watches the standings for clinch/elimination transitions. Fires only on an observed change between two snapshots — the first run of a season seeds state and posts nothing. |
| `/api/cron/check-series-preview` | Every 15 min | Posts a postseason series preview once a matchup resolves. No-ops outside the postseason window. |

### Manual triggers

| Route | Description |
|-------|-------------|
| `/api/manual/post-game?gamePk=<id>&force=true` | Post a specific game. `force=true` skips dedup check. |
| `/api/manual/post-news?url=<url>&title=<title>&force=true` | Post a specific news article. |
| `/api/manual/post-odds?dry=true` | Trigger odds post. `dry=true` returns formatted text without posting. |
| `/api/cron/check-clinch?dry=true` | Evaluate clinch state and render any pending cast without posting. |
| `/api/cron/check-series-preview?dry=true` | Render a pending series preview without posting. |

### Utility

| Route | Description |
|-------|-------------|
| `/api/health` | Health check — Redis connectivity, bot config status. No auth required. |
| `/api/video/[slug]` | OG video wrapper page for Farcaster unfurler fallback. No auth required. |

All cron and manual routes require auth via `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` header.

## Project structure

```
pages/api/
  cron/
    check-games.ts       # Game monitor cron
    check-news.ts        # News monitor cron
    check-odds.ts        # Odds monitor cron
    check-clinch.ts      # Clinch/elimination monitor cron
    check-series-preview.ts # Postseason series preview cron
  manual/
    post-game.ts         # Manual game post
    post-news.ts         # Manual news post
    post-odds.ts         # Manual odds post
  health.ts              # Health check
  video/[slug].ts        # OG video wrapper

src/
  lib/
    clinch.ts            # Clinch/elimination transition detection
    config.ts            # Constants, Redis keys/TTLs, thresholds
    mlb-api.ts           # MLB Stats API client (schedule, feed, content)
    neynar.ts            # Farcaster posting (Neynar SDK + FC Client API)
    farcaster-auth.ts    # EIP-191 auth for Farcaster Client API
    video.ts             # Video upload via TUS to Farcaster Stream
    store.ts             # Upstash Redis (dedup, tracking, odds storage)
    formatter.ts         # Cast text formatting (box scores, news, embeds)
    news.ts              # RSS fetch + keyword significance scoring
    polymarket.ts        # Polymarket CLOB API client + odds formatting
    twitter.ts           # Twitter cross-posting (best-effort)
  types/
    mlb.ts               # MLB API response types
```

## Cast examples

### Game recap

```
⚾ FINAL: Cubs 3, Cardinals 0

STL  000 000 000  0R 3H 0E
CHC  000 003 00x  3R 6H 0E

W: C. Holmes | L: M. Liberatore | S: J. Webb

⭐ C. Holmes 6.2 IP, 0 ER, 3 K, 1 BB · S. Suzuki 2-4, HR, 2B, 3 RBI

📋 Record/streak/rank: 72-52 (0.581) / W1 / 2nd in NL Central (3.5 GB) / WC1 (+6.5)
```
*+ native inline highlight video*

The `WC{rank} ({games})` segment appears only after the All-Star break, and only
when the Cubs do not lead the division. `+6.5` means 6.5 games **clear of the
last wild card spot** — MLB measures this field against the cut line, not the
leader — and `even` means level with it.

In the postseason the standings footer is replaced by the series state:

```
⚾ Division Series FINAL: Cubs 6, Brewers 0

MIL  000 000 000  0R 3H 1E
CHC  300 001 11x  6R 10H 0E

W: D. Palencia | L: F. Peralta

⭐ K. Tucker 2-3, HR, RBI, 2 R · M. Boyd 4.2 IP, 0 ER, 6 K, 3 BB

🏆 NLDS Game 4: Series tied 2-2
```

### Clinch

```
🎫 CLINCHED: Cubs are going to the postseason

📋 Record/streak/rank: 88-64 (0.579) / W4 / 2nd in NL Central (5.0 GB) / WC1 (+10.0)
🃏 Wild card berth — currently the 4 seed in the NL
```

### Series preview

```
🏆 NLDS: Cubs at Brewers

📅 Game 1 — Sat, Oct 4, 1:08 PM CT (best-of-5)
🏟️ American Family Field
⚾ Probables: M. Boyd vs F. Peralta

Season series: Cubs 7-6
CHC 92-70 · 50-31 home · 3.79 ERA · 4.90 R/G
MIL 97-65 · 52-29 home · 3.58 ERA · 4.98 R/G
```

### News

```
Cubs News: Basallo ROY? Griffin 20/20? Here are 30 prospect predictions

📰 Jordan Bastian | MLB.com
```

### Odds

```
📊 Cubs Odds Update (Polymarket)

🏆 World Series: 3.5% (+1.2%)
🏅 NL Central: 4.2% (-0.3%)
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEYNAR_API_KEY` | Yes | Neynar API key for Farcaster SDK |
| `NEYNAR_SIGNER_UUID` | Yes | Neynar signer UUID for casting |
| `FC_CUSTODY_MNEMONIC` | Yes | 12-word mnemonic for Farcaster Client API auth (EIP-191) |
| `CRON_SECRET` | Yes | Auth token for cron and manual endpoints |
| `BOT_ENABLED` | Yes | Set to `"true"` to enable posting |
| `KV_REST_API_URL` | Yes | Upstash Redis URL (via Vercel integration) |
| `KV_REST_API_TOKEN` | Yes | Upstash Redis token |
| `FARCASTER_CHANNEL_ID` | No | Channel ID, defaults to `"cubs"` |
| `NEWS_ENABLED` | No | Set to `"true"` to enable news posting |
| `TWITTER_ENABLED` | No | Set to `"true"` to enable Twitter cross-posting |
| `TWITTER_API_KEY` | No | Twitter API credentials (4 vars) |
| `TWITTER_API_SECRET` | No | |
| `TWITTER_ACCESS_TOKEN` | No | |
| `TWITTER_ACCESS_SECRET` | No | |
| `POLYMARKET_REFERRAL` | No | Referral code appended to Polymarket URLs |
| `ELIMINATION_CAST_ENABLED` | No | Set to `"true"` to allow elimination casts. Off by default. |

## Deduplication

All posting is deduplicated via Upstash Redis:

| Content | Redis key | TTL |
|---------|-----------|-----|
| Game recap | `game:{gamePk}` | 30 days |
| News article | `news:{guid}` | 7 days |
| Odds update | `odds:posted` | 6 days |
| Clinch state snapshot | `clinch:state:{season}` | 120 days |
| Clinch cast | `clinch:posted:{season}:{event}` | 120 days |
| Series preview | `series-preview:{gamePk}` | 60 days |
| Highlight retry counter | `track:{gamePk}` | 24 hours |

## Development

```bash
npm install
npm run dev
```

Requires `.env.local` with the variables listed above. Game and news posting can be tested via the manual endpoints with `force=true`.

## Deployment

Deployed on Vercel with cron jobs configured in `vercel.json`. Pushes to `main` auto-deploy.

```json
{
  "crons": [
    { "path": "/api/cron/check-games", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/check-news", "schedule": "0 */2 * * *" },
    { "path": "/api/cron/check-odds", "schedule": "0 14 * * 1" },
    { "path": "/api/cron/check-clinch", "schedule": "20 * * * *" },
    { "path": "/api/cron/check-series-preview", "schedule": "*/15 * * * *" }
  ]
}
```

Game-related routes have a 300s (5 min) max duration to accommodate video upload and processing.
