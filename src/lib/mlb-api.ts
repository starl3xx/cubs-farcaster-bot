import { MLB_API_BASE, CUBS_TEAM_ID } from "./config";
import type {
  ScheduleResponse,
  GameFeed,
  GameContent,
  StandingsResponse,
  ScheduleGame,
  ScheduleTeam,
  CubsStanding,
  TeamRecord,
  SeasonDates,
  SeasonsResponse,
  SeriesStatus,
} from "../types/mlb";

// National League id in the MLB Stats API
const NL_LEAGUE_ID = 104;

/**
 * Note: no `gameTypes` filter. Adding one returns zero games on postseason
 * dates, which would take the bot dark for all of October.
 */
export async function getSchedule(date: string): Promise<ScheduleResponse> {
  const url = `${MLB_API_BASE}/api/v1/schedule?teamId=${CUBS_TEAM_ID}&sportId=1&date=${date}&hydrate=team,seriesStatus`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB schedule API error: ${res.status}`);
  return res.json();
}

export async function getGameFeed(gamePk: number): Promise<GameFeed> {
  const url = `${MLB_API_BASE}/api/v1.1/game/${gamePk}/feed/live`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB game feed API error: ${res.status}`);
  return res.json();
}

export async function getGameContent(gamePk: number): Promise<GameContent> {
  const url = `${MLB_API_BASE}/api/v1/game/${gamePk}/content`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB game content API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch Cubs standings as of an optional date (YYYY-MM-DD). When unspecified,
 * returns current standings. Returns null on any error so callers can fall back
 * gracefully — standings are a "nice to have" for the post-game cast.
 */
export async function getCubsStanding(
  date?: string
): Promise<CubsStanding | null> {
  try {
    const season = (date ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
    const params = new URLSearchParams({
      leagueId: String(NL_LEAGUE_ID),
      season,
      standingsTypes: "regularSeason",
    });
    if (date) params.set("date", date);

    const url = `${MLB_API_BASE}/api/v1/standings?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: StandingsResponse = await res.json();

    for (const record of data.records) {
      const cubs = record.teamRecords.find((t) => t.team.id === CUBS_TEAM_ID);
      if (cubs) {
        return {
          seed: playoffSeed(cubs, data),
          wins: cubs.wins,
          losses: cubs.losses,
          winningPercentage: cubs.winningPercentage,
          divisionRank: cubs.divisionRank,
          divisionGamesBack: cubs.divisionGamesBack,
          streakCode: cubs.streak?.streakCode,
          clinched: cubs.clinched,
          divisionChamp: cubs.divisionChamp,
          divisionLeader: cubs.divisionLeader,
          wildCardGamesBack: cubs.wildCardGamesBack,
          eliminationNumber: cubs.eliminationNumber,
          wildCardEliminationNumber: cubs.wildCardEliminationNumber,
          wildCardRank: cubs.wildCardRank,
          wildCardLeader: cubs.wildCardLeader,
          magicNumber: cubs.magicNumber,
          clinchIndicator: cubs.clinchIndicator,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn("[getCubsStanding] failed:", err);
    return null;
  }
}

/**
 * Playoff seed 1-6, which the API does not expose. `leagueRank` is NOT the
 * seed — the 2024 Orioles ranked 3rd in the AL but were the 4 seed, because
 * all three division champs are seeded ahead of every wild card.
 *
 * Division champs take 1-3, ordered among themselves by leagueRank.
 * Wild cards take 4-6, in wildCardRank order.
 */
function playoffSeed(
  cubs: TeamRecord,
  data: StandingsResponse
): number | undefined {
  if (cubs.divisionChamp === true) {
    // Rank against the three CURRENT division leaders, not the teams that
    // happen to have clinched already. Division titles clinch days apart, so
    // filtering on divisionChamp would make whoever clinches first look like
    // the 1 seed — in 2007 the Cubs clinched as the NL's weakest division
    // leader and would have been announced as the 1 seed instead of the 3.
    // divisionRank "1" is used rather than divisionLeader because the 2020
    // format flagged two teams per division as divisionLeader.
    const leaders = data.records
      .map((r) => r.teamRecords.find((t) => t.divisionRank === "1"))
      .filter((t): t is TeamRecord => t != null)
      .sort((a, b) => Number(a.leagueRank) - Number(b.leagueRank));
    const idx = leaders.findIndex((t) => t.team.id === CUBS_TEAM_ID);
    return idx >= 0 ? idx + 1 : undefined;
  }

  // wildCardRank is not tiebreaker-aware, so a clinched team can sit at rank 4
  // or worse. Rather than announce a nonexistent "7 seed", say nothing.
  const rank = Number(cubs.wildCardRank);
  if (!Number.isFinite(rank) || rank < 1 || rank > 3) return undefined;
  return 3 + rank;
}

// Season boundaries never change once published, so one fetch per season is enough.
const seasonDatesCache = new Map<string, SeasonDates>();

/**
 * Fetch a season's calendar boundaries (All-Star date, regular season end, etc).
 * Returns null on any error so callers fail closed rather than rendering
 * un-gated content.
 */
export async function getSeasonDates(
  season: string
): Promise<SeasonDates | null> {
  const cached = seasonDatesCache.get(season);
  if (cached) return cached;

  try {
    const url = `${MLB_API_BASE}/api/v1/seasons?sportId=1&season=${season}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: SeasonsResponse = await res.json();

    // An unknown season returns HTTP 200 with an empty array.
    const dates = data.seasons?.[0];
    if (!dates) return null;

    seasonDatesCache.set(season, dates);
    return dates;
  } catch (err) {
    console.warn("[getSeasonDates] failed:", err);
    return null;
  }
}

/**
 * Series state for a single game, for callers that hold a gamePk but no
 * schedule row (the manual post-game route). check-games already has this on
 * the ScheduleGame it iterates and must not re-fetch.
 */
export async function getSeriesStatusForGame(
  gamePk: number,
  date: string
): Promise<SeriesStatus | null> {
  try {
    const data = await getSchedule(date);
    for (const d of data.dates || []) {
      for (const game of d.games) {
        if (game.gamePk === gamePk) return game.seriesStatus ?? null;
      }
    }
    return null;
  } catch (err) {
    console.warn("[getSeriesStatusForGame] failed:", err);
    return null;
  }
}

/**
 * Cubs postseason schedule rows for a date range.
 *
 * Uses the plain schedule endpoint on purpose: /api/v1/schedule/postseason
 * silently IGNORES teamId and would return all 47 games including AL series.
 * `hydrate=team` is mandatory — the placeholder flag that distinguishes a real
 * opponent from MLB's pre-created "NL 4/5 Winner" slot is only returned with it.
 */
export async function getPostseasonSchedule(
  startDate: string,
  endDate: string
): Promise<ScheduleGame[]> {
  try {
    const url =
      `${MLB_API_BASE}/api/v1/schedule?teamId=${CUBS_TEAM_ID}&sportId=1` +
      `&startDate=${startDate}&endDate=${endDate}&gameTypes=F,D,L,W` +
      `&hydrate=team,seriesStatus,probablePitcher,venue`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: ScheduleResponse = await res.json();
    return (data.dates || []).flatMap((d) => d.games);
  } catch (err) {
    console.warn("[getPostseasonSchedule] failed:", err);
    return [];
  }
}

/** A real club, not one of MLB's pre-created postseason slots. */
export function isResolvedTeam(side?: ScheduleTeam): boolean {
  const team = side?.team;
  if (!team || typeof team.id !== "number") return false;
  if (team.placeholder === true) return false;
  // Real club ids are well under 1000; placeholder slots use 2710-5533.
  return team.id > 0 && team.id < 1000;
}

/**
 * Regular-season head-to-head record vs an opponent, from the Cubs' side.
 *
 * `opponentId` is a supported schedule param. Two traps handled here: the
 * response includes Postponed rows, and a made-up game appears under the SAME
 * gamePk on both its original and makeup dates. Filtering on codedGameState
 * "F" fixes both at once.
 */
export async function getSeasonSeriesRecord(
  opponentId: number,
  season: string
): Promise<{ wins: number; losses: number } | null> {
  try {
    const url =
      `${MLB_API_BASE}/api/v1/schedule?teamId=${CUBS_TEAM_ID}` +
      `&opponentId=${opponentId}&season=${season}&sportId=1&gameTypes=R`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: ScheduleResponse = await res.json();

    let wins = 0;
    let losses = 0;
    const seen = new Set<number>();

    for (const d of data.dates || []) {
      for (const game of d.games) {
        if (game.status.codedGameState !== "F") continue;
        if (seen.has(game.gamePk)) continue;
        seen.add(game.gamePk);

        const cubsSide =
          game.teams.home.team.id === CUBS_TEAM_ID ? game.teams.home : game.teams.away;
        if (cubsSide.isWinner) wins++;
        else losses++;
      }
    }

    return wins + losses > 0 ? { wins, losses } : null;
  } catch (err) {
    console.warn("[getSeasonSeriesRecord] failed:", err);
    return null;
  }
}

export interface TeamSeasonSummary {
  wins: number;
  losses: number;
  homeWins?: number;
  homeLosses?: number;
  era?: string;
  runsPerGame?: string;
}

/**
 * Season record, home split, ERA and runs/game for a set of teams.
 *
 * Queries BOTH leagues with no date param: a World Series opponent is in the
 * AL, and a postseason date returns zero records.
 */
export async function getTeamSeasonSummaries(
  teamIds: number[],
  season: string
): Promise<Map<number, TeamSeasonSummary>> {
  const out = new Map<number, TeamSeasonSummary>();

  try {
    const url = `${MLB_API_BASE}/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`;
    const res = await fetch(url);
    if (!res.ok) return out;
    const data: StandingsResponse = await res.json();

    for (const record of data.records) {
      for (const t of record.teamRecords) {
        if (!teamIds.includes(t.team.id)) continue;
        const home = t.records?.splitRecords?.find((s) => s.type === "home");
        out.set(t.team.id, {
          wins: t.wins,
          losses: t.losses,
          homeWins: home?.wins,
          homeLosses: home?.losses,
        });
      }
    }

    // Team stats come from a separate endpoint, one call per team.
    await Promise.all(
      teamIds.map(async (id) => {
        const entry = out.get(id);
        if (!entry) return;
        try {
          const sres = await fetch(
            `${MLB_API_BASE}/api/v1/teams/${id}/stats?season=${season}&group=hitting,pitching&stats=season&sportId=1`
          );
          if (!sres.ok) return;
          const sdata = await sres.json();
          for (const split of sdata.stats || []) {
            const stat = split.splits?.[0]?.stat;
            if (!stat) continue;
            if (split.group?.displayName === "pitching") entry.era = stat.era;
            if (split.group?.displayName === "hitting" && stat.gamesPlayed) {
              entry.runsPerGame = (stat.runs / stat.gamesPlayed).toFixed(2);
            }
          }
        } catch {
          // Stats are decoration — the record alone is enough.
        }
      })
    );

    return out;
  } catch (err) {
    console.warn("[getTeamSeasonSummaries] failed:", err);
    return out;
  }
}

/**
 * Get today's date and yesterday's date in YYYY-MM-DD format (Central Time).
 * We check both to catch late West Coast games that end after midnight CT.
 */
export function getGameDates(): string[] {
  const now = new Date();
  // Use Central Time (Cubs timezone)
  const ct = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const today = formatDate(ct);

  const yesterday = new Date(ct);
  yesterday.setDate(yesterday.getDate() - 1);

  return [today, formatDate(yesterday)];
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
