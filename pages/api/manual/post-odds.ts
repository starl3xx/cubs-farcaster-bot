import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCubsOdds, formatOddsCast } from "../../../src/lib/polymarket";
import { postToChannel } from "../../../src/lib/neynar";
import {
  getPreviousOdds,
  saveCurrentOdds,
  markOddsPosted,
} from "../../../src/lib/store";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = req.query.dry === "true";

  try {
    const current = await fetchCubsOdds();
    const previous = await getPreviousOdds();
    const { text, embeds } = formatOddsCast(current, previous);

    let result = { hash: undefined as string | undefined, error: "dry run" };

    if (!dryRun) {
      const postResult = await postToChannel(text, {
        embeds: embeds.map((url) => ({ url })),
      });
      result = postResult as typeof result;

      // Save current as baseline
      await saveCurrentOdds({
        worldSeries: current.worldSeries,
        nlCentral: current.nlCentral,
        timestamp: new Date().toISOString(),
      });

      if (postResult.hash) {
        await markOddsPosted(postResult.hash);
      }
    }

    return res.status(200).json({
      ok: true,
      current,
      previous: previous || null,
      text,
      embeds,
      posted: !!result.hash,
      castHash: result.hash || null,
      error: result.error || null,
    });
  } catch (err) {
    console.error("[post-odds] Error:", err);
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
