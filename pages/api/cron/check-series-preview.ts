import type { NextApiRequest, NextApiResponse } from "next";
import {
  getPostseasonSchedule,
  getSeasonDates,
  getSeasonSeriesRecord,
  getTeamSeasonSummaries,
  isResolvedTeam,
} from "../../../src/lib/mlb-api";
import { formatSeriesPreviewCast } from "../../../src/lib/formatter";
import { postToChannel } from "../../../src/lib/neynar";
import {
  isSeriesPreviewPosted,
  markSeriesPreviewPosted,
} from "../../../src/lib/store";
import { CUBS_TEAM_ID } from "../../../src/lib/config";

const ROUND_LABELS: Record<string, string> = {
  F: "NL Wild Card Series",
  D: "NLDS",
  L: "NLCS",
  W: "World Series",
};

/**
 * Post a preview when a Cubs postseason series matchup resolves.
 *
 * The whole feature hinges on the placeholder gate. MLB pre-creates the entire
 * postseason slate with convincing fake teams ("NL 4/5 Winner", id 5533, venue
 * "NL Stadium"), and the Cubs get slotted as an NLDS host days before their
 * wild card opponent is known — so "appears under teamId=112" is NOT enough.
 * Both sides must be real clubs before anything posts.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dry = req.query.dry === "true";

  try {
    const season = String(new Date().getFullYear());
    const seasonDates = await getSeasonDates(season);
    if (!seasonDates?.postSeasonStartDate || !seasonDates?.postSeasonEndDate) {
      return res.status(200).json({ ok: true, message: "no postseason dates for season" });
    }

    // Cheap no-op for the ~10 months a year this cannot possibly fire.
    const today = new Date().toISOString().slice(0, 10);
    if (today < seasonDates.postSeasonStartDate || today > seasonDates.postSeasonEndDate) {
      return res.status(200).json({ ok: true, message: "outside postseason window" });
    }

    const games = await getPostseasonSchedule(
      seasonDates.postSeasonStartDate,
      seasonDates.postSeasonEndDate
    );

    const results: Record<string, string> = {};

    for (const game of games) {
      if (game.seriesGameNumber !== 1) continue;
      if (!ROUND_LABELS[game.gameType]) continue;
      // Never post once first pitch has happened.
      if (game.status.abstractGameState !== "Preview") continue;

      const key = `game_${game.gamePk}`;

      if (!isResolvedTeam(game.teams.away) || !isResolvedTeam(game.teams.home)) {
        results[key] = "skipped: matchup not resolved";
        continue;
      }
      if (await isSeriesPreviewPosted(game.gamePk)) {
        results[key] = "already posted";
        continue;
      }

      const cubsAreHome = game.teams.home.team.id === CUBS_TEAM_ID;
      const cubsSide = cubsAreHome ? game.teams.home : game.teams.away;
      const oppSide = cubsAreHome ? game.teams.away : game.teams.home;
      const opponentId = oppSide.team.id;

      const [seasonSeries, summaries] = await Promise.all([
        getSeasonSeriesRecord(opponentId, season),
        getTeamSeasonSummaries([CUBS_TEAM_ID, opponentId], season),
      ]);

      const text = formatSeriesPreviewCast({
        round: ROUND_LABELS[game.gameType],
        // teamName is the bare nickname ("Blue Jays"); team.name is the full
        // "Toronto Blue Jays". hydrate=team is what supplies it.
        opponentName: oppSide.team.teamName || oppSide.team.name,
        opponentAbbr: oppSide.team.abbreviation || oppSide.team.teamName || "OPP",
        cubsAreHome,
        gamesInSeries: game.gamesInSeries,
        gameDate: game.gameDate,
        startTimeTBD: game.status.startTimeTBD,
        venue: game.venue?.name,
        cubsProbable: cubsSide.probablePitcher?.fullName,
        opponentProbable: oppSide.probablePitcher?.fullName,
        seasonSeries,
        cubsSummary: summaries.get(CUBS_TEAM_ID),
        opponentSummary: summaries.get(opponentId),
      });

      if (dry) {
        results[key] = `dry run:\n${text}`;
        continue;
      }

      const result = await postToChannel(text, {
        idem: `series-preview-${game.gamePk}`,
      });

      if (result.hash) {
        await markSeriesPreviewPosted(game.gamePk, result.hash);
        results[key] = `posted: ${result.hash}`;
      } else {
        results[key] = `failed: ${result.error}`;
      }
    }

    return res.status(200).json({ ok: true, gamesChecked: games.length, results });
  } catch (err) {
    console.error("[check-series-preview] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function verifyAuth(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  if (req.headers["x-cron-secret"] === secret) return true;
  return false;
}
