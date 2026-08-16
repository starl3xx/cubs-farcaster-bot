export const CUBS_TEAM_ID = 112;
export const CUBS_ABBREVIATION = "CHC";
export const CHANNEL_ID = process.env.FARCASTER_CHANNEL_ID || "cubs";
export const CAST_CHAR_LIMIT = 1024;

// MLB Stats API (free, no auth)
export const MLB_API_BASE = "https://statsapi.mlb.com";

// Redis key prefixes and TTLs
export const REDIS_KEYS = {
  GAME_POSTED: "game:", // game:{gamePk} → cast hash
  NEWS_POSTED: "news:", // news:{guid} → cast hash
  GAME_TRACKING: "track:", // track:{gamePk} → retry count
  ODDS_PREVIOUS: "odds:previous", // previous week's odds snapshot
  ODDS_POSTED: "odds:posted", // dedup: one odds post per week
  VIDEO_BLOB: "video:", // video:{slug} → { blobUrl, posterUrl }
  CLINCH_STATE: "clinch:state:", // clinch:state:{season} → last seen ClinchState
  CLINCH_POSTED: "clinch:posted:", // clinch:posted:{season}:{event} → cast hash
  SERIES_PREVIEW: "series-preview:", // series-preview:{game1GamePk} → cast hash
} as const;

export const REDIS_TTL = {
  GAME_POSTED: 60 * 60 * 24 * 30, // 30 days
  NEWS_POSTED: 60 * 60 * 24 * 7, // 7 days
  GAME_TRACKING: 60 * 60 * 24, // 24 hours
  ODDS: 60 * 60 * 24 * 14, // 14 days (keep 2 weeks for comparison)
  VIDEO_BLOB: 60 * 60 * 24 * 30, // 30 days
  // Must outlive the gap between clinching (mid-September) and the end of the
  // postseason, or a lapsed key would let a clinch cast fire twice.
  CLINCH: 60 * 60 * 24 * 120, // 120 days
  SERIES_PREVIEW: 60 * 60 * 24 * 60, // 60 days
} as const;

// Elimination casts land in a fan channel on a bad night — off by default.
export const ELIMINATION_CAST_ENABLED =
  process.env.ELIMINATION_CAST_ENABLED === "true";

// Highlight retry: 12 retries × 5 min interval = 1 hour max wait
export const MAX_HIGHLIGHT_RETRIES = 12;

// News: consider articles from the last 8 hours (2hr cron + RSS cache buffer)
export const NEWS_LOOKBACK_MS = 8 * 60 * 60 * 1000;
export const NEWS_SIGNIFICANCE_THRESHOLD = 50;

// RSS feed URL
export const CUBS_RSS_URL = "https://www.mlb.com/cubs/feeds/news/rss.xml";
