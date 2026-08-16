import { CUBS_TEAM_ID } from "./config";
import type {
  GameFeed,
  GameContent,
  Playback,
  CubsStanding,
  SeriesStatus,
  Boxscore,
  BattingStats,
  PitchingStats,
} from "../types/mlb";
import type { ClinchEvent } from "./clinch";
import type { TeamSeasonSummary } from "./mlb-api";

/** Game types that are a postseason series. */
const POSTSEASON_TYPES = new Set(["F", "D", "L", "W"]);

/**
 * Round names for the series footer, keyed by gameType. seriesStatus.shortName
 * is asymmetric ("NLDS" for D but "NL Wild Card Series" for F), so we map
 * locally and use shortName only as a fallback.
 */
const SERIES_ROUND_LABELS: Record<string, string> = {
  F: "NL Wild Card",
  D: "NLDS",
  L: "NLCS",
  W: "World Series",
};

const GAME_TYPE_LABELS: Record<string, string> = {
  S: "Spring Training",
  E: "Exhibition",
  F: "Wild Card",
  D: "Division Series",
  L: "League Championship",
  W: "World Series",
  A: "All-Star Game",
};

export interface BoxScoreCastOptions {
  /** Doubleheader slot, when > 1. */
  gameNumber?: number;
  standing?: CubsStanding | null;
  /** Series state for postseason games. Ignored for other game types. */
  seriesStatus?: SeriesStatus | null;
  /** Season's All-Star date (YYYY-MM-DD). Wild card is suppressed without it. */
  allStarDate?: string | null;
  /** This game's official date (YYYY-MM-DD), compared against allStarDate. */
  officialDate?: string;
}

/**
 * Format a box score cast from MLB game feed data.
 *
 * Regular season:
 * ⚾ FINAL: Astros 4, Cubs 2
 *
 * HOU  001 210 000  4R 9H 2E
 * CHC  000 002 000  2R 4H 0E
 *
 * W: S. Arrighetti | L: J. Taillon | S: B. King
 *
 * ⭐ P. Crow-Armstrong 3-4, HR, 4 RBI
 *
 * 📋 Record/streak/rank: 29-22 (0.569) / L6 / 3rd in NL Central (2.5 GB) / WC1 (+6.5)
 *
 * Postseason: the standings footer is replaced by the series state, e.g.
 * 🏆 NLDS Game 4: Series tied 2-2
 */
export function formatBoxScoreCast(
  feed: GameFeed,
  opts: BoxScoreCastOptions = {}
): string {
  const { gameNumber, standing, seriesStatus, allStarDate, officialDate } = opts;
  const { gameData, liveData } = feed;
  const { linescore, decisions } = liveData;
  const away = gameData.teams.away;
  const home = gameData.teams.home;

  const awayRuns = linescore.teams.away.runs;
  const homeRuns = linescore.teams.home.runs;

  const awayWon = awayRuns > homeRuns;
  const winner = awayWon ? away : home;
  const loser = awayWon ? home : away;
  const winnerRuns = awayWon ? awayRuns : homeRuns;
  const loserRuns = awayWon ? homeRuns : awayRuns;

  // Game type prefix (Spring Training, Postseason, etc.)
  const gameType = gameData.game?.type || "R";
  const gameTypeLabel = GAME_TYPE_LABELS[gameType];
  const prefixLabel = gameTypeLabel ? `${gameTypeLabel} ` : "";

  // Headline: ⚾ [Spring Training ]FINAL: Winner X, Loser Y[ (10 inn.)][ (Game 2)]
  const doubleheaderTag =
    gameNumber && gameNumber > 1 ? ` (Game ${gameNumber})` : "";
  const extraInnings =
    linescore.currentInning > 9 ? ` (${linescore.currentInning} inn.)` : "";
  const headline = `⚾ ${prefixLabel}FINAL: ${winner.teamName} ${winnerRuns}, ${loser.teamName} ${loserRuns}${extraInnings}${doubleheaderTag}`;

  // Inning-by-inning line score
  const lineScore = formatLineScore(linescore, away.abbreviation, home.abbreviation);

  // Decisions line (no emoji prefix; first names abbreviated to first initial)
  const decisionsLine = formatDecisions(decisions);

  // Top Cubs performers, computed over Cubs players only.
  const starLine = formatStarPerformers(liveData.boxscore);

  // Footer. Explicitly allowlisted by game type rather than gated on whether
  // data happens to be present: standings return real records on spring dates
  // in Tokyo/Seoul-opener years, and seriesStatus is attached to EVERY game
  // (a routine August sweep reports "CHC wins 3-0"). Either would render a
  // convincing, wrong footer if the gate were loosened.
  let footerLine = "";
  if (gameType === "R") {
    footerLine = formatStandings(standing, allStarDate, officialDate);
  } else if (POSTSEASON_TYPES.has(gameType)) {
    // seriesStatus team refs carry only the full name ("Milwaukee Brewers"),
    // so take the nickname from the feed to match the headline.
    const opponent = home.id === CUBS_TEAM_ID ? away : home;
    footerLine = formatSeriesLine(seriesStatus, gameType, opponent.teamName);
  }

  const parts = [headline, "", lineScore];
  if (decisionsLine) parts.push("", decisionsLine);
  if (starLine) parts.push("", starLine);
  if (footerLine) parts.push("", footerLine);

  return parts.join("\n");
}

/**
 * Series state after this game, phrased relative to the Cubs.
 *
 * seriesStatus.result is deliberately not used: it is series-leader-relative,
 * so it would print "MIL leads 2-1" under a "⚾ FINAL: Cubs 4, Brewers 3"
 * headline (a real 2025 NLDS Game 3 case). It is also an optional key with
 * unstable grammar across rounds.
 */
function formatSeriesLine(
  ss: SeriesStatus | null | undefined,
  gameType: string,
  opponentName: string
): string {
  if (!ss) return "";

  // Unplayed games report 0-0 with isTied defaulted to true.
  if (ss.result == null && ss.wins === 0 && ss.losses === 0) return "";

  const round = SERIES_ROUND_LABELS[gameType] || ss.shortName || "Postseason";

  // winningTeam/losingTeam are absent entirely when the series is level.
  const cubsLead = ss.winningTeam?.id === CUBS_TEAM_ID;
  const cubsTrail = ss.losingTeam?.id === CUBS_TEAM_ID;
  const tied = ss.winningTeam == null && ss.losingTeam == null;

  if (ss.isOver) {
    if (cubsLead) {
      return gameType === "W"
        ? `🏆 CUBS WIN THE WORLD SERIES ${ss.wins}-${ss.losses}`
        : `🏆 ${round}: Cubs win the series ${ss.wins}-${ss.losses}`;
    }
    if (cubsTrail) {
      return `❌ ${round}: ${opponentName} win the series ${ss.wins}-${ss.losses}`;
    }
    return "";
  }

  const gameLabel = `${round} Game ${ss.gameNumber}`;
  if (tied) return `🏆 ${gameLabel}: Series tied ${ss.wins}-${ss.losses}`;
  if (cubsLead) return `🏆 ${gameLabel}: Cubs lead ${ss.wins}-${ss.losses}`;
  // wins/losses are relative to the series leader, so flip them for the Cubs.
  if (cubsTrail) return `🏆 ${gameLabel}: Cubs trail ${ss.losses}-${ss.wins}`;
  return "";
}

function formatLineScore(
  linescore: GameFeed["liveData"]["linescore"],
  awayAbbr: string,
  homeAbbr: string
): string {
  const innings = linescore.innings;
  const numInnings = Math.max(innings.length, 9);

  // Get run value for a half-inning
  function inningRuns(idx: number, side: "away" | "home"): string {
    const inn = innings[idx];
    if (side === "home" && idx === numInnings - 1 && inn?.home?.runs === undefined) {
      return "x";
    }
    const runs = inn?.[side]?.runs;
    return runs !== undefined ? String(runs) : " ";
  }

  // Build innings grouped by 3 (traditional baseball box score format).
  // Grouped digits avoid proportional-font alignment issues since all
  // digits are the same width — no space-padding needed within groups.
  function groupedInnings(side: "away" | "home"): string {
    const groups: string[] = [];
    for (let g = 0; g < numInnings; g += 3) {
      let chunk = "";
      for (let i = g; i < Math.min(g + 3, numInnings); i++) {
        chunk += inningRuns(i, side);
      }
      groups.push(chunk);
    }
    return groups.join(" ");
  }

  const { away, home } = linescore.teams;

  const awayLine = `${awayAbbr}  ${groupedInnings("away")}  ${away.runs}R ${away.hits}H ${away.errors}E`;
  const homeLine = `${homeAbbr}  ${groupedInnings("home")}  ${home.runs}R ${home.hits}H ${home.errors}E`;

  return `${awayLine}\n${homeLine}`;
}

function formatDecisions(
  decisions: GameFeed["liveData"]["decisions"]
): string {
  if (!decisions) return "";

  const parts: string[] = [];
  if (decisions.winner) parts.push(`W: ${abbreviateName(decisions.winner.fullName)}`);
  if (decisions.loser) parts.push(`L: ${abbreviateName(decisions.loser.fullName)}`);
  if (decisions.save) parts.push(`S: ${abbreviateName(decisions.save.fullName)}`);

  return parts.join(" | ");
}

// Minimum game score to earn a mention.
const STAR_SCORE_FLOOR = 50;
// Pitchers additionally need real workload: the base score alone clears the
// floor after ~1.2 clean innings, which would hand a mop-up reliever equal
// billing with a two-homer game.
const STAR_PITCHER_MIN_OUTS = 12;
// A save, win, or hold also counts as earning the mention.
const DECISION_NOTE = /^\((W|S|H)/;

interface StarCandidate {
  score: number;
  text: string;
  tiebreak: number[];
}

/**
 * One line naming the best Cubs hitter and pitcher, e.g.
 * "⭐ C. Holmes 6.2 IP, 0 ER, 3 K, 1 BB · S. Suzuki 2-4, HR, 2B, 3 RBI"
 *
 * Deliberately does NOT read boxscore.topPerformers: that block is game-wide,
 * and contained zero Cubs in ~15% of games — including a 2025 NLDS game the
 * Cubs won, where all three listed performers were Brewers. The scores below
 * reproduce MLB's own formulas, so this computes the same ranking over the
 * Cubs half of the box score.
 *
 * Stat lines are built from integer fields rather than stats.*.summary, which
 * embeds a " | " that collides with the decisions separator, caps extras in a
 * way that hides real production, and lists strikeouts for hitters.
 */
function formatStarPerformers(boxscore: Boxscore): string {
  const side =
    boxscore.teams.home.team.id === CUBS_TEAM_ID ? "home" : "away";
  const players = boxscore.teams[side].players;
  if (!players) return "";

  const hitters: StarCandidate[] = [];
  const pitchers: StarCandidate[] = [];

  for (const player of Object.values(players)) {
    const name = player.person?.fullName;
    if (!name) continue;

    const batting = player.stats?.batting;
    if (batting && (batting.plateAppearances ?? 0) > 0) {
      const score = hittingGameScore(batting);
      if (score >= STAR_SCORE_FLOOR) {
        hitters.push({
          score,
          text: `${abbreviateName(name)} ${formatHitterLine(batting)}`,
          tiebreak: [batting.totalBases ?? 0, batting.rbi ?? 0, -player.person.id],
        });
      }
    }

    const pitching = player.stats?.pitching;
    const outs = pitching?.outs ?? 0;
    if (pitching && (outs > 0 || (pitching.battersFaced ?? 0) > 0)) {
      const score = pitchingGameScore(pitching);
      const earnedIt =
        outs >= STAR_PITCHER_MIN_OUTS || DECISION_NOTE.test(pitching.note ?? "");
      if (score >= STAR_SCORE_FLOOR && earnedIt) {
        pitchers.push({
          score,
          text: `${abbreviateName(name)} ${formatPitcherLine(pitching)}`,
          tiebreak: [outs, pitching.strikeOuts ?? 0, -player.person.id],
        });
      }
    }
  }

  const best = [pickBest(hitters), pickBest(pitchers)].filter(
    (c): c is StarCandidate => c != null
  );
  if (!best.length) return "";

  // Lead with the bigger performance, whether he hit or pitched.
  best.sort((a, b) => b.score - a.score);
  return `⭐ ${best.map((c) => c.text).join(" · ")}`;
}

/** Deterministic pick — check-games retries the same game up to 12 times. */
function pickBest(candidates: StarCandidate[]): StarCandidate | null {
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (let i = 0; i < a.tiebreak.length; i++) {
      if (b.tiebreak[i] !== a.tiebreak[i]) return b.tiebreak[i] - a.tiebreak[i];
    }
    return 0;
  })[0];
}

function hittingGameScore(b: BattingStats): number {
  const walks = (b.baseOnBalls ?? 0) - (b.intentionalWalks ?? 0);
  return (
    42 +
    4 * (b.hits ?? 0) +
    2 * (b.totalBases ?? 0) +
    2 * (b.rbi ?? 0) +
    2 * (b.runs ?? 0) +
    3 * walks +
    3 * (b.hitByPitch ?? 0) +
    2 * (b.stolenBases ?? 0) -
    4 * (b.caughtStealing ?? 0) -
    2 * (b.atBats ?? 0) -
    2 * (b.sacFlies ?? 0)
  );
}

/** Tango Game Score v2 — note it uses runs, not earned runs. */
function pitchingGameScore(p: PitchingStats): number {
  return (
    40 +
    2 * (p.outs ?? 0) +
    (p.strikeOuts ?? 0) -
    2 * (p.baseOnBalls ?? 0) -
    2 * (p.hits ?? 0) -
    3 * (p.runs ?? 0) -
    6 * (p.homeRuns ?? 0)
  );
}

/** "2-4, HR, 2B, 3 RBI" — up to three extras, strikeouts deliberately omitted. */
function formatHitterLine(b: BattingStats): string {
  const extras: string[] = [];
  const add = (count: number, label: string) => {
    if (count > 0) extras.push(count > 1 ? `${count} ${label}` : label);
  };

  add(b.homeRuns ?? 0, "HR");
  add(b.triples ?? 0, "3B");
  add(b.doubles ?? 0, "2B");
  add(b.rbi ?? 0, "RBI");
  add(b.runs ?? 0, "R");
  // Display the official BB total. The score formula subtracts IBB, but the
  // box score does not, and a bare "BB" label must match the box score.
  add(b.baseOnBalls ?? 0, "BB");
  add(b.stolenBases ?? 0, "SB");
  add(b.hitByPitch ?? 0, "HBP");

  const line = `${b.hits ?? 0}-${b.atBats ?? 0}`;
  return extras.length ? `${line}, ${extras.slice(0, 3).join(", ")}` : line;
}

/** "6.2 IP, 0 ER, 3 K, 1 BB" */
function formatPitcherLine(p: PitchingStats): string {
  const parts = [
    `${p.inningsPitched ?? "0.0"} IP`,
    `${p.earnedRuns ?? 0} ER`,
    `${p.strikeOuts ?? 0} K`,
  ];
  if ((p.baseOnBalls ?? 0) > 0) parts.push(`${p.baseOnBalls} BB`);
  return parts.join(", ");
}

/**
 * Abbreviate "Spencer Arrighetti" → "S. Arrighetti". Single-token names pass
 * through unchanged so we don't truncate something like "Ichiro".
 */
export function abbreviateName(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length < 2) return fullName;
  const [first, ...rest] = tokens;
  const initial = first.charAt(0).toUpperCase();
  return `${initial}. ${rest.join(" ")}`;
}

function formatStandings(
  standing?: CubsStanding | null,
  allStarDate?: string | null,
  officialDate?: string
): string {
  if (!standing) return "";

  const { wins, losses, winningPercentage, divisionRank, divisionGamesBack, streakCode } = standing;

  // MLB API returns winningPercentage as ".569" — render as "0.569"
  const pct = winningPercentage.startsWith(".")
    ? `0${winningPercentage}`
    : winningPercentage;

  // "-" means the Cubs lead the division. A negative value would mean games
  // ahead, so guard the sign rather than the exact string.
  const rankClause =
    divisionGamesBack && !divisionGamesBack.startsWith("-")
      ? `${ordinal(divisionRank)} in NL Central (${divisionGamesBack} GB)`
      : `${ordinal(divisionRank)} in NL Central`;

  const segments = [`${wins}-${losses} (${pct})`];
  if (streakCode) segments.push(streakCode);
  segments.push(rankClause);

  const wildCard = formatWildCard(standing, allStarDate, officialDate);
  if (wildCard) segments.push(wildCard);

  return `\u{1F4CB} Record/streak/rank: ${segments.join(" / ")}`;
}

/**
 * Wild card standing, e.g. "WC1 (+6.5)".
 *
 * Only rendered after the All-Star break, and only when the Cubs are actually
 * in the wild card race. Three things make this trickier than it looks:
 *
 *  - wildCardGamesBack is measured against the LAST wild card spot, not the
 *    leader. "+6.5" means 6.5 games CLEAR of the cut line, not behind anything.
 *  - "-" is overloaded three ways: division leader (not applicable), in a spot
 *    and level with the cut line, and out of a spot but level with it. Only
 *    wildCardRank/wildCardLeader disambiguate.
 *  - wildCardRank and wildCardLeader are OMITTED from the payload rather than
 *    set false, so every check is `!= null` / `=== true`.
 *
 * Fails closed: no All-Star date means no line.
 */
function formatWildCard(
  standing: CubsStanding,
  allStarDate?: string | null,
  officialDate?: string
): string {
  if (!allStarDate || !officialDate) return "";
  // YYYY-MM-DD compares correctly lexicographically.
  if (officialDate <= allStarDate) return "";

  // Division leaders have no wild card standing at all.
  if (standing.divisionLeader === true) return "";
  const rank = standing.wildCardRank;
  if (rank == null) return "";

  const gb = standing.wildCardGamesBack;
  if (!gb) return "";

  // Print the API's string verbatim — its decimal formatting varies ("+9.0"
  // vs "+6.5") and re-formatting would drift from the division GB alongside it.
  const magnitude = gb === "-" ? "even" : gb;

  return `WC${rank} (${magnitude})`;
}

function ordinal(rank: string): string {
  const n = Number(rank);
  if (!Number.isFinite(n)) return rank;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface MediaEmbeds {
  embeds: string[];
  /** Raw mp4 URL from MLB CDN — needs upload to Livepeer for native playback */
  videoMp4Url?: string;
  /** Editorial recap photo URL — used as fallback */
  posterUrl?: string;
}

/**
 * Extract the best media embed from game content.
 * Priority: recap video (HLS) > editorial recap photo > any highlight video
 *
 * Prefers HLS (.m3u8) URLs which Warpcast plays as native inline video.
 */
export function extractMediaEmbeds(content: GameContent): MediaEmbeds {
  const embeds: string[] = [];
  let videoMp4Url: string | undefined;

  // 1. Try recap video, fall back to top Cubs play highlight
  let videoResult = extractHighlightUrl(content);
  if (!videoResult) {
    videoResult = extractCubsHighlightUrl(content);
  }
  const posterUrl = extractEditorialPhoto(content) || undefined;

  if (videoResult) {
    videoMp4Url = videoResult.url;
  } else {
    // Fall back to editorial recap photo only when no video is available
    if (posterUrl) {
      embeds.push(posterUrl);
    }
  }

  return { embeds, videoMp4Url, posterUrl };
}

interface HighlightResult {
  url: string;
}

/**
 * Extract the recap highlight video URL from game content.
 * Prefers HLS (.m3u8) for native Warpcast playback, falls back to mp4.
 */
export function extractHighlightUrl(content: GameContent): HighlightResult | null {
  // Try media.epg first (newer format)
  if (content.media?.epg) {
    for (const epg of content.media.epg) {
      if (epg.title === "Recap" && epg.items?.length) {
        const url = findBestPlayback(epg.items[0].playbacks);
        if (url) return { url };
      }
    }
  }

  // Try media.highlights (another path)
  if (content.media?.highlights?.highlights?.items) {
    for (const item of content.media.highlights.highlights.items) {
      if (isRecapItem(item)) {
        const url = findBestPlayback(item.playbacks);
        if (url) return { url };
      }
    }
  }

  // Fall back to top-level highlights
  if (content.highlights?.highlights?.items) {
    for (const item of content.highlights.highlights.items) {
      if (isRecapItem(item)) {
        const url = findBestPlayback(item.playbacks);
        if (url) return { url };
      }
    }
  }

  return null;
}

/**
 * Extract the top Cubs play highlight when no recap video exists.
 * Only matches in-game-highlight videos tagged with the Cubs team.
 * Skips data-visualization items (low-res 4s infographics).
 */
function extractCubsHighlightUrl(content: GameContent): HighlightResult | null {
  const items = content.highlights?.highlights?.items;
  if (!items?.length) return null;

  const cubsTag = `teamid-${CUBS_TEAM_ID}`;

  for (const item of items) {
    if (item.type !== "video") continue;

    const kw = item.keywordsAll || [];
    const isCubs = kw.some((k) => k.value === cubsTag);
    if (!isCubs) continue;

    const isPlayHighlight = kw.some((k) => k.value === "in-game-highlight");

    if (isPlayHighlight) {
      const url = findBestPlayback(item.playbacks);
      if (url) return { url };
    }
  }

  return null;
}

function isRecapItem(item: { type: string; title: string; keywordsAll?: { type: string; value: string }[] }): boolean {
  return (
    item.type === "video" &&
    (item.title?.toLowerCase().includes("recap") ||
      item.keywordsAll?.some(
        (k) => k.type === "slug" && k.value === "recap"
      ) === true)
  );
}

/**
 * Extract the editorial recap photo from game content.
 * Returns a 960x540 (16:9) JPG URL — good balance of quality and load time.
 */
function extractEditorialPhoto(content: GameContent): string | null {
  const image = content.editorial?.recap?.mlb?.image;
  if (!image?.cuts?.length) return null;

  // Prefer 960x540 (16:9) — good embed size
  const preferred = image.cuts.find(
    (c) => c.aspectRatio === "16:9" && c.width === 960
  );
  if (preferred) return preferred.src;

  // Fall back to any 16:9 cut, largest first
  const widecuts = image.cuts
    .filter((c) => c.aspectRatio === "16:9")
    .sort((a, b) => b.width - a.width);
  if (widecuts.length) return widecuts[0].src;

  // Last resort: any cut
  return image.cuts[0]?.src || null;
}

function findBestPlayback(playbacks?: Playback[]): string | null {
  if (!playbacks?.length) return null;

  // Prefer mp4Avc — we upload this to Livepeer for native Warpcast playback
  const mp4Avc = playbacks.find((p) => p.name === "mp4Avc");
  if (mp4Avc) return mp4Avc.url;

  // Fall back to any mp4
  const mp4 = playbacks.find((p) => p.name?.toLowerCase().includes("mp4"));
  if (mp4) return mp4.url;

  return playbacks[0]?.url || null;
}

/**
 * Format a news cast from an RSS item.
 */
export function formatNewsCast(
  title: string,
  author: string | undefined,
  url: string
): string {
  const parts = [`\u{1F4E3} Cubs news: ${title}`];
  if (author) {
    parts.push("", `\u270D\uFE0F ${author} | Read more \u{1F447}`);
  } else {
    parts.push("", `Read more \u{1F447}`);
  }
  return parts.join("\n");
}

/**
 * Format a clinch or elimination cast.
 *
 * Reuses the exact record line the recap footer emits, so these casts inherit
 * the same visual grammar (and the wild card segment) automatically.
 */
export function formatClinchCast(
  event: ClinchEvent,
  standing: CubsStanding,
  allStarDate?: string | null,
  officialDate?: string
): string {
  const recordLine = formatStandings(standing, allStarDate, officialDate);
  const seed = standing.seed;

  let headline: string;
  let detail: string;

  switch (event) {
    case "division":
      headline = "\u{1F3C6} CLINCHED: Cubs win the NL Central";
      detail = seed
        ? `\u{1F3AB} NL Central champions — currently the ${seed} seed`
        : "\u{1F3AB} NL Central champions";
      break;
    case "bestInLeague":
      headline =
        "\u{1F3DF}️ CLINCHED: Cubs have the best record in the National League";
      detail = "\u{1F3AB} The 1 seed — home field through the NLCS";
      break;
    case "eliminated":
      headline = "\u{1F51A} ELIMINATED: Cubs are out of postseason contention";
      detail = "";
      break;
    case "berth":
    default:
      headline = "\u{1F3AB} CLINCHED: Cubs are going to the postseason";
      // The seed keeps moving after a berth is locked, hence "currently".
      detail = seed
        ? `\u{1F0CF} Wild card berth — currently the ${seed} seed in the NL`
        : "\u{1F0CF} Postseason berth locked";
      break;
  }

  const parts = [headline, ""];
  if (recordLine) parts.push(recordLine);
  if (detail) parts.push(detail);
  return parts.join("\n");
}

export interface SeriesPreviewOptions {
  round: string;
  opponentName: string;
  opponentAbbr: string;
  cubsAreHome: boolean;
  gamesInSeries?: number;
  /** ISO timestamp. Omitted from the cast when startTimeTBD is set. */
  gameDate?: string;
  startTimeTBD?: boolean;
  venue?: string;
  cubsProbable?: string;
  opponentProbable?: string;
  seasonSeries?: { wins: number; losses: number } | null;
  cubsSummary?: TeamSeasonSummary;
  opponentSummary?: TeamSeasonSummary;
}

/**
 * Format a postseason series preview cast, posted once a matchup resolves.
 *
 * Every optional field degrades independently: probable pitchers are only
 * published 1-2 days out, and an unresolved start time carries a fabricated
 * 07:33Z value that must never be rendered.
 */
export function formatSeriesPreviewCast(o: SeriesPreviewOptions): string {
  const vs = o.cubsAreHome ? "vs" : "at";
  const parts = [`\u{1F3C6} ${o.round}: Cubs ${vs} ${o.opponentName}`, ""];

  const format = o.gamesInSeries ? ` (best-of-${o.gamesInSeries})` : "";
  const when = formatFirstPitch(o.gameDate, o.startTimeTBD);
  parts.push(`\u{1F4C5} Game 1${when ? ` — ${when}` : ""}${format}`);
  if (o.venue) parts.push(`\u{1F3DF}️ ${o.venue}`);

  if (o.cubsProbable && o.opponentProbable) {
    const [first, second] = o.cubsAreHome
      ? [o.opponentProbable, o.cubsProbable]
      : [o.cubsProbable, o.opponentProbable];
    parts.push(`⚾ Probables: ${abbreviateName(first)} vs ${abbreviateName(second)}`);
  }

  const stat = (s?: TeamSeasonSummary) => {
    if (!s) return null;
    const bits = [`${s.wins}-${s.losses}`];
    if (s.homeWins != null && s.homeLosses != null) {
      bits.push(`${s.homeWins}-${s.homeLosses} home`);
    }
    if (s.era) bits.push(`${s.era} ERA`);
    if (s.runsPerGame) bits.push(`${s.runsPerGame} R/G`);
    return bits.join(" · ");
  };

  const seriesLine = formatSeasonSeries(o.seasonSeries, o.opponentName);
  const cubsStat = stat(o.cubsSummary);
  const oppStat = stat(o.opponentSummary);

  if (seriesLine || cubsStat || oppStat) {
    parts.push("");
    if (seriesLine) parts.push(seriesLine);
    if (cubsStat) parts.push(`CHC ${cubsStat}`);
    if (oppStat) parts.push(`${o.opponentAbbr} ${oppStat}`);
  }

  return parts.join("\n");
}

function formatSeasonSeries(
  record: { wins: number; losses: number } | null | undefined,
  opponentName: string
): string {
  if (!record) return "";
  const { wins, losses } = record;
  if (wins === losses) return `Season series: ${wins}-${losses}`;
  return wins > losses
    ? `Season series: Cubs ${wins}-${losses}`
    : `Season series: ${opponentName} ${losses}-${wins}`;
}

/** "Sat Oct 4, 1:08 PM CT" in Cubs time, or just the date when the time is TBD. */
function formatFirstPitch(iso?: string, startTimeTBD?: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  const datePart = d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (startTimeTBD) return datePart;

  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart} CT`;
}
