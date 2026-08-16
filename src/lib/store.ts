import { Redis } from "@upstash/redis";
import { REDIS_KEYS, REDIS_TTL } from "./config";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)!,
      token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)!,
    });
  }
  return redis;
}

// Game dedup
export async function isGamePosted(gamePk: number): Promise<boolean> {
  const result = await getRedis().get(`${REDIS_KEYS.GAME_POSTED}${gamePk}`);
  return result !== null;
}

export async function markGamePosted(
  gamePk: number,
  castHash: string
): Promise<void> {
  await getRedis().set(`${REDIS_KEYS.GAME_POSTED}${gamePk}`, castHash, {
    ex: REDIS_TTL.GAME_POSTED,
  });
}

// News dedup
export async function isNewsPosted(guid: string): Promise<boolean> {
  const result = await getRedis().get(`${REDIS_KEYS.NEWS_POSTED}${guid}`);
  return result !== null;
}

export async function markNewsPosted(
  guid: string,
  castHash: string
): Promise<void> {
  await getRedis().set(`${REDIS_KEYS.NEWS_POSTED}${guid}`, castHash, {
    ex: REDIS_TTL.NEWS_POSTED,
  });
}

// Game highlight tracking (retry counter)
export async function getGameTracking(gamePk: number): Promise<number> {
  const result = await getRedis().get<number>(
    `${REDIS_KEYS.GAME_TRACKING}${gamePk}`
  );
  return result ?? 0;
}

export async function incrementGameTracking(gamePk: number): Promise<number> {
  const key = `${REDIS_KEYS.GAME_TRACKING}${gamePk}`;
  const count = await getRedis().incr(key);
  // Set TTL on first increment
  if (count === 1) {
    await getRedis().expire(key, REDIS_TTL.GAME_TRACKING);
  }
  return count;
}

// Polymarket odds tracking
export interface StoredOdds {
  worldSeries: number;
  nlCentral: number;
  timestamp: string;
}

export async function getPreviousOdds(): Promise<StoredOdds | null> {
  return getRedis().get<StoredOdds>(REDIS_KEYS.ODDS_PREVIOUS);
}

export async function saveCurrentOdds(odds: StoredOdds): Promise<void> {
  await getRedis().set(REDIS_KEYS.ODDS_PREVIOUS, odds, {
    ex: REDIS_TTL.ODDS,
  });
}

export async function isOddsPostedThisWeek(): Promise<boolean> {
  const result = await getRedis().get(REDIS_KEYS.ODDS_POSTED);
  return result !== null;
}

export async function markOddsPosted(castHash: string): Promise<void> {
  // Expires in 6 days — prevents double-posting within a week
  await getRedis().set(REDIS_KEYS.ODDS_POSTED, castHash, {
    ex: 60 * 60 * 24 * 6,
  });
}

// Video blob URL storage
export interface VideoBlob {
  blobUrl: string;
  posterUrl?: string;
}

export async function saveVideoBlob(
  slug: string,
  data: VideoBlob
): Promise<void> {
  await getRedis().set(`${REDIS_KEYS.VIDEO_BLOB}${slug}`, data, {
    ex: REDIS_TTL.VIDEO_BLOB,
  });
}

export async function getVideoBlob(slug: string): Promise<VideoBlob | null> {
  return getRedis().get<VideoBlob>(`${REDIS_KEYS.VIDEO_BLOB}${slug}`);
}

// Clinch / elimination tracking
//
// The bot is otherwise stateless, but these casts fire on a TRANSITION, so the
// previously observed flags have to be persisted. Storing the whole snapshot
// (rather than a per-event boolean) is what makes safe seeding possible: on the
// very first run of a season there is no prior snapshot, so the caller records
// what it sees and posts nothing.
export interface ClinchState {
  clinched: boolean;
  divisionChamp: boolean;
  bestInLeague: boolean;
  eliminated: boolean;
}

export async function getClinchState(
  season: string
): Promise<ClinchState | null> {
  return getRedis().get<ClinchState>(`${REDIS_KEYS.CLINCH_STATE}${season}`);
}

export async function saveClinchState(
  season: string,
  state: ClinchState
): Promise<void> {
  await getRedis().set(`${REDIS_KEYS.CLINCH_STATE}${season}`, state, {
    ex: REDIS_TTL.CLINCH,
  });
}

/**
 * Second, independent guard on top of the state snapshot. If a cast posts but
 * the state write then fails, this still prevents a repeat.
 */
export async function isClinchEventPosted(
  season: string,
  event: string
): Promise<boolean> {
  const result = await getRedis().get(
    `${REDIS_KEYS.CLINCH_POSTED}${season}:${event}`
  );
  return result !== null;
}

export async function markClinchEventPosted(
  season: string,
  event: string,
  castHash: string
): Promise<void> {
  await getRedis().set(
    `${REDIS_KEYS.CLINCH_POSTED}${season}:${event}`,
    castHash,
    { ex: REDIS_TTL.CLINCH }
  );
}

// Postseason series preview dedup, keyed on Game 1's gamePk. Postseason gamePks
// are pre-allocated and stay stable when placeholder teams resolve to real ones.
export async function isSeriesPreviewPosted(gamePk: number): Promise<boolean> {
  const result = await getRedis().get(`${REDIS_KEYS.SERIES_PREVIEW}${gamePk}`);
  return result !== null;
}

export async function markSeriesPreviewPosted(
  gamePk: number,
  castHash: string
): Promise<void> {
  await getRedis().set(`${REDIS_KEYS.SERIES_PREVIEW}${gamePk}`, castHash, {
    ex: REDIS_TTL.SERIES_PREVIEW,
  });
}

// Health check
export async function getRedisStatus(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    await getRedis().ping();
    return { connected: true };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
