import type { NextApiRequest, NextApiResponse } from "next";
import { getRedisStatus } from "../../src/lib/store";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  const redis = await getRedisStatus();

  const status = {
    ok: redis.connected,
    timestamp: new Date().toISOString(),
    redis,
    env: {
      botEnabled: process.env.BOT_ENABLED === "true",
      newsEnabled: process.env.NEWS_ENABLED === "true",
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.NEYNAR_SIGNER_UUID,
      hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasCronSecret: !!process.env.CRON_SECRET,
    },
  };

  return res.status(redis.connected ? 200 : 503).json(status);
}
