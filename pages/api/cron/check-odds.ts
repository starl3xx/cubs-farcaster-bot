import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCubsOdds, formatOddsCast } from "../../../src/lib/polymarket";
import { postToChannel } from "../../../src/lib/neynar";
import { postTweet } from "../../../src/lib/twitter";
import {
  getPreviousOdds,
  saveCurrentOdds,
  isOddsPostedThisWeek,
  markOddsPosted,
} from "../../../src/lib/store";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Dedup: only post once per week
    if (await isOddsPostedThisWeek()) {
      return res.status(200).json({ ok: true, message: "Already posted this week" });
    }

    // Fetch current odds
    const current = await fetchCubsOdds();

    // Get previous week's odds for comparison
    const previous = await getPreviousOdds();

    // Format the cast
    const { text, embeds } = formatOddsCast(current, previous);

    // Post to channel
    const result = await postToChannel(text, {
      embeds: embeds.map((url) => ({ url })),
      idem: `odds-${new Date().toISOString().slice(0, 10)}`,
    });

    // Save current odds as the new baseline
    await saveCurrentOdds({
      worldSeries: current.worldSeries,
      nlCentral: current.nlCentral,
      timestamp: new Date().toISOString(),
    });

    if (result.hash) {
      await markOddsPosted(result.hash);
    }

    // Cross-post to Twitter (best-effort)
    const tweetResult = await postTweet(text);
    if (tweetResult.error) {
      console.error("[check-odds] Twitter error (non-fatal):", tweetResult.error);
    }

    return res.status(200).json({
      ok: true,
      current,
      previous: previous || null,
      text,
      posted: !!result.hash,
      castHash: result.hash || null,
      tweetId: tweetResult.tweetId || null,
      error: result.error || null,
    });
  } catch (err) {
    console.error("[check-odds] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function verifyAuth(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;

  if (req.headers["x-cron-secret"] === secret) return true;

  return false;
}
