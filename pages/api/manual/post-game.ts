import type { NextApiRequest, NextApiResponse } from "next";
import { getGameFeed, getGameContent, getCubsStanding } from "../../../src/lib/mlb-api";
import { formatBoxScoreCast, extractMediaEmbeds } from "../../../src/lib/formatter";
import { postToChannel } from "../../../src/lib/neynar";
import { uploadToFarcasterStream } from "../../../src/lib/video";
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

    const { embeds: mediaUrls, videoMp4Url } = extractMediaEmbeds(content);
    const standing = await getCubsStanding(feed.gameData.datetime.officialDate);
    const text = formatBoxScoreCast(feed, undefined, standing);

    // Upload video to Farcaster Stream for native inline playback
    let finalUrls = mediaUrls;
    let hasVideo = false;
    if (videoMp4Url) {
      const playbackUrl = await uploadToFarcasterStream(videoMp4Url, String(gamePk));
      if (playbackUrl) {
        finalUrls = [playbackUrl];
        hasVideo = true;
      }
    }

    const embeds = finalUrls.map((url) => ({ url }));

    const result = await postToChannel(text, {
      embeds,
      idem: force ? undefined : `game-${gamePk}`,
      hasVideo,
    });

    if (result.hash) {
      await markGamePosted(gamePk, result.hash);
    }

    return res.status(200).json({
      ok: true,
      gamePk,
      text,
      mediaUrls: finalUrls,
      posted: !!result.hash,
      castHash: result.hash || null,
      error: result.error || null,
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
