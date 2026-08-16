import type { CubsStanding } from "../types/mlb";
import type { ClinchState } from "./store";

/**
 * Postseason clinch / elimination detection.
 *
 * Every predicate here is written against fields whose semantics were verified
 * against the live MLB API, because several of them are actively misleading:
 *
 *  - `eliminationNumber === "E"` means eliminated from the DIVISION, not the
 *    playoffs. The 2025 Cubs carried it while holding the top wild card. Real
 *    elimination requires wildCardEliminationNumber === "E" as well.
 *  - `wildCardLeader` / `wildCardRank` are omitted rather than set false, and
 *    they are NOT authoritative for who actually made it — in the final 2024
 *    standings the D-backs showed wildCardLeader true and missed October while
 *    the Braves, absent from the flag, clinched. `clinched` is the authority.
 *  - `clinchIndicator` skips rungs (absent -> "w" directly), so transitions
 *    must be derived from the booleans, never from the indicator's history.
 */

export type ClinchEvent =
  | "berth"
  | "division"
  | "bestInLeague"
  | "eliminated";

export function readClinchState(s: CubsStanding): ClinchState {
  return {
    clinched: s.clinched === true,
    divisionChamp: s.divisionChamp === true,
    bestInLeague: s.clinchIndicator === "z",
    eliminated:
      s.clinched !== true &&
      s.eliminationNumber === "E" &&
      s.wildCardEliminationNumber === "E",
  };
}

/**
 * Events newly true in `next` that were not true in `prev`.
 *
 * Returns [] when prev is null — a first observation is not a transition, and
 * treating it as one would fire a "CUBS CLINCH" cast on first deploy for a
 * state that may be weeks old.
 */
export function detectClinchEvents(
  prev: ClinchState | null,
  next: ClinchState
): ClinchEvent[] {
  if (!prev) return [];

  const events: ClinchEvent[] = [];
  if (!prev.clinched && next.clinched) events.push("berth");
  if (!prev.divisionChamp && next.divisionChamp) events.push("division");
  if (!prev.bestInLeague && next.bestInLeague) events.push("bestInLeague");
  if (!prev.eliminated && next.eliminated) events.push("eliminated");
  return events;
}

/** Human label for each event, used for the Redis dedup key. */
export const CLINCH_EVENT_LABELS: Record<ClinchEvent, string> = {
  berth: "berth",
  division: "division",
  bestInLeague: "best-in-league",
  eliminated: "eliminated",
};

/** Strongest first. */
const CLINCH_PRECEDENCE = ["bestInLeague", "division", "berth"] as const;

/**
 * Reduce simultaneous clinch events to the single strongest one.
 *
 * Winning the division also clinches a berth, so both flags flip in the same
 * instant and an hourly poll never sees an intermediate state. Posting both
 * would announce "Wild card berth" moments before "Cubs win the NL Central" —
 * the first of which is simply false.
 *
 * Suppressed events are returned so the caller can mark them handled and stop
 * them firing on a later run.
 */
export function collapseClinchEvents(events: ClinchEvent[]): {
  toPost: ClinchEvent[];
  suppressed: ClinchEvent[];
} {
  const clinches = events.filter((e) => e !== "eliminated");
  const rest = events.filter((e) => e === "eliminated");

  if (clinches.length <= 1) {
    return { toPost: [...clinches, ...rest], suppressed: [] };
  }

  const strongest: ClinchEvent | undefined = CLINCH_PRECEDENCE.find((e) =>
    clinches.includes(e)
  );
  if (!strongest) return { toPost: [...clinches, ...rest], suppressed: [] };

  return {
    toPost: [strongest, ...rest],
    suppressed: clinches.filter((e) => e !== strongest),
  };
}
