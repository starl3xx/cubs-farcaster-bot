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
