import type { NextApiRequest, NextApiResponse } from "next";
import { getGameFeed, getGameContent } from "../../../src/lib/mlb-api";
import { formatBoxScoreCast, extractHighlightUrl } from "../../../src/lib/formatter";
import { postToChannel } from "../../../src/lib/neynar";
import { isGamePosted, markGamePosted } from "../../../src/lib/store";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const gamePk = Number(req.query.gamePk);
  if (!gamePk || isNaN(gamePk)) {
    return res.status(400).json({ error: "gamePk query param required" });
  }

  const force = req.query.force === "true";

  try {
    // Check if already posted (unless forcing)
    if (!force && (await isGamePosted(gamePk))) {
      return res.status(200).json({
        ok: true,
        message: "Already posted. Use ?force=true to re-post.",
      });
    }

    const [feed, content] = await Promise.all([
      getGameFeed(gamePk),
      getGameContent(gamePk),
    ]);

    const highlightUrl = extractHighlightUrl(content);
    const text = formatBoxScoreCast(feed);
    const embeds = highlightUrl ? [{ url: highlightUrl }] : [];

    const result = await postToChannel(text, {
      embeds,
      idem: force ? undefined : `game-${gamePk}`,
    });

    if (result) {
      await markGamePosted(gamePk, result.hash);
    }

    return res.status(200).json({
      ok: true,
      gamePk,
      text,
      highlightUrl,
      posted: !!result,
      castHash: result?.hash || null,
    });
  } catch (err) {
    console.error("[post-game] Error:", err);
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
