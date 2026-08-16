import type { NextApiRequest, NextApiResponse } from "next";
import { getCubsStanding, getSeasonDates } from "../../../src/lib/mlb-api";
import { formatClinchCast } from "../../../src/lib/formatter";
import { postToChannel } from "../../../src/lib/neynar";
import {
  getClinchState,
  saveClinchState,
  isClinchEventPosted,
  markClinchEventPosted,
} from "../../../src/lib/store";
import {
  readClinchState,
  detectClinchEvents,
  collapseClinchEvents,
  CLINCH_EVENT_LABELS,
} from "../../../src/lib/clinch";
import { ELIMINATION_CAST_ENABLED } from "../../../src/lib/config";

/**
 * Watch the standings for clinch / elimination transitions.
 *
 * These casts are unrecoverable if wrong, so the design is deliberately
 * conservative:
 *
 *  - Fires only on an observed TRANSITION between two snapshots. The first run
 *    of a season records what it sees and posts nothing, so deploying in
 *    September cannot announce a clinch that happened weeks earlier.
 *  - A second Redis key per event guards against a post succeeding while the
 *    state write fails.
 *  - Elimination is behind an env flag; it is off unless explicitly enabled.
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
    // No date param: this is the only form that still returns records once the
    // regular season ends, and it is always "as of now" during the season.
    const standing = await getCubsStanding();
    if (!standing) {
      return res.status(200).json({ ok: true, message: "no standings (offseason or API error)" });
    }

    const season = String(new Date().getFullYear());
    const next = readClinchState(standing);
    const prev = await getClinchState(season);

    if (!prev) {
      // A dry run must not consume the transition — these events happen once a
      // year, and advancing the snapshot here would silently eat the real cast.
      if (!dry) await saveClinchState(season, next);
      return res.status(200).json({
        ok: true,
        message: "seeded initial clinch state; no events fired on first observation",
        state: next,
        dry,
      });
    }

    const detected = detectClinchEvents(prev, next);
    // Clinching the division also clinches a berth in the same instant.
    const { toPost, suppressed } = collapseClinchEvents(detected);

    // Persist before posting: a duplicate cast is worse than a missed one, and
    // the per-event key below is what actually guarantees delivery-once.
    if (!dry) await saveClinchState(season, next);

    const results: Record<string, string> = {};

    for (const event of suppressed) {
      const label = CLINCH_EVENT_LABELS[event];
      results[event] = "suppressed: superseded by a stronger simultaneous event";
      if (!dry) await markClinchEventPosted(season, label, "suppressed");
    }

    for (const event of toPost) {
      if (event === "eliminated" && !ELIMINATION_CAST_ENABLED) {
        results[event] = "skipped: elimination casts disabled";
        continue;
      }

      const label = CLINCH_EVENT_LABELS[event];
      if (await isClinchEventPosted(season, label)) {
        results[event] = "already posted";
        continue;
      }

      const seasonDates = await getSeasonDates(season);
      const text = formatClinchCast(
        event,
        standing,
        seasonDates?.allStarDate ?? seasonDates?.lastDate1stHalf,
        new Date().toISOString().slice(0, 10)
      );

      if (dry) {
        results[event] = `dry run:\n${text}`;
        continue;
      }

      const result = await postToChannel(text, {
        idem: `clinch-${season}-${label}`,
      });

      if (result.hash) {
        await markClinchEventPosted(season, label, result.hash);
        results[event] = `posted: ${result.hash}`;
      } else {
        results[event] = `failed: ${result.error}`;
      }
    }

    return res.status(200).json({
      ok: true,
      season,
      previous: prev,
      current: next,
      detected,
      posted: toPost,
      suppressed,
      results,
    });
  } catch (err) {
    console.error("[check-clinch] Error:", err);
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
