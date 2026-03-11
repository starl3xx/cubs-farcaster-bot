import type { NextApiRequest, NextApiResponse } from "next";
import { getSchedule, getGameFeed, getGameContent, getGameDates } from "../../../src/lib/mlb-api";
import { formatBoxScoreCast, extractHighlightUrl, extractMediaEmbeds } from "../../../src/lib/formatter";
import { postToChannel } from "../../../src/lib/neynar";
import { uploadToLivepeer } from "../../../src/lib/video";
import {
  isGamePosted,
  markGamePosted,
  getGameTracking,
  incrementGameTracking,
} from "../../../src/lib/store";
import { MAX_HIGHLIGHT_RETRIES } from "../../../src/lib/config";
import type { ScheduleGame } from "../../../src/types/mlb";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Auth check
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const dates = getGameDates();
    const results: Record<string, string> = {};

    // Fetch schedules for today and yesterday
    const schedules = await Promise.all(dates.map((d) => getSchedule(d)));

    // Collect all unique final games
    const seenPks = new Set<number>();
    const finalGames: ScheduleGame[] = [];

    for (const schedule of schedules) {
      for (const date of schedule.dates || []) {
        for (const game of date.games) {
          if (seenPks.has(game.gamePk)) continue;
          seenPks.add(game.gamePk);

          if (game.status.abstractGameState === "Final") {
            // Skip postponed/suspended
            const state = game.status.detailedState.toLowerCase();
            if (state.includes("postponed") || state.includes("suspended")) {
              results[`game_${game.gamePk}`] = `skipped: ${state}`;
              continue;
            }
            finalGames.push(game);
          }
        }
      }
    }

    // Process each final game
    for (const game of finalGames) {
      const gamePk = game.gamePk;

      // Already posted?
      if (await isGamePosted(gamePk)) {
        results[`game_${gamePk}`] = "already posted";
        continue;
      }

      // Fetch feed and content in parallel
      const [feed, content] = await Promise.all([
        getGameFeed(gamePk),
        getGameContent(gamePk),
      ]);

      // Check for highlight video
      const highlightResult = extractHighlightUrl(content);
      const retryCount = await getGameTracking(gamePk);

      if (!highlightResult && retryCount < MAX_HIGHLIGHT_RETRIES) {
        // No highlight yet, wait and retry
        await incrementGameTracking(gamePk);
        results[`game_${gamePk}`] = `waiting for highlight (retry ${retryCount + 1}/${MAX_HIGHLIGHT_RETRIES})`;
        continue;
      }

      // Format and post
      const text = formatBoxScoreCast(feed, game.gameNumber > 1 ? game.gameNumber : undefined);
      const { embeds: mediaUrls, videoMp4Url } = extractMediaEmbeds(content);

      // Upload video to Livepeer for native Warpcast playback
      let finalUrls = mediaUrls;
      if (videoMp4Url) {
        const playbackUrl = await uploadToLivepeer(videoMp4Url, String(gamePk));
        if (playbackUrl) {
          finalUrls = [playbackUrl];
        }
        // If upload fails, finalUrls stays as mediaUrls (photo fallback)
      }

      const embeds = finalUrls.map((url) => ({ url }));

      const result = await postToChannel(text, {
        embeds,
        idem: `game-${gamePk}`,
      });

      if (result.hash) {
        await markGamePosted(gamePk, result.hash);
        results[`game_${gamePk}`] = `posted: ${result.hash}`;
      } else {
        results[`game_${gamePk}`] = `failed: ${result.error}`;
      }
    }

    return res.status(200).json({
      ok: true,
      dates,
      gamesChecked: finalGames.length,
      results,
    });
  } catch (err) {
    console.error("[check-games] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function verifyAuth(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel cron sends this header automatically
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;

  // Also check the x-cron-secret header (for manual testing)
  if (req.headers["x-cron-secret"] === secret) return true;

  return false;
}
