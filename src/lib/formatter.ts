import { CUBS_TEAM_ID } from "./config";
import type {
  GameFeed,
  GameContent,
  Playback,
  CubsStanding,
} from "../types/mlb";

const GAME_TYPE_LABELS: Record<string, string> = {
  S: "Spring Training",
  E: "Exhibition",
  F: "Wild Card",
  D: "Division Series",
  L: "League Championship",
  W: "World Series",
  A: "All-Star Game",
};

/**
 * Format a box score cast from MLB game feed data.
 *
 * Example output:
 * ⚾ FINAL: Astros 4, Cubs 2
 *
 * HOU  001 210 000  4R 9H 2E
 * CHC  000 002 000  2R 4H 0E
 *
 * W: S. Arrighetti | L: J. Taillon | S: B. King
 *
 * 📋 Record/streak/rank: 29-22 (0.569) / L6 / 3rd in NL Central (2.5 GB)
 */
export function formatBoxScoreCast(
  feed: GameFeed,
  gameNumber?: number,
  standing?: CubsStanding | null
): string {
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

  // Record/streak/rank footer. Standings are regular-season only — omit for
  // spring training, exhibitions, and postseason where the line is misleading.
  const standingsLine = gameType === "R" ? formatStandings(standing) : "";

  const parts = [headline, "", lineScore];
  if (decisionsLine) parts.push("", decisionsLine);
  if (standingsLine) parts.push("", standingsLine);

  return parts.join("\n");
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
  if (decisions.winner) parts.push(`W: ${abbreviatePitcher(decisions.winner.fullName)}`);
  if (decisions.loser) parts.push(`L: ${abbreviatePitcher(decisions.loser.fullName)}`);
  if (decisions.save) parts.push(`S: ${abbreviatePitcher(decisions.save.fullName)}`);

  return parts.join(" | ");
}

/**
 * Abbreviate "Spencer Arrighetti" → "S. Arrighetti". Single-token names pass
 * through unchanged so we don't truncate something like "Ichiro".
 */
function abbreviatePitcher(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length < 2) return fullName;
  const [first, ...rest] = tokens;
  const initial = first.charAt(0).toUpperCase();
  return `${initial}. ${rest.join(" ")}`;
}

function formatStandings(standing?: CubsStanding | null): string {
  if (!standing) return "";

  const { wins, losses, winningPercentage, divisionRank, divisionGamesBack, streakCode } = standing;

  // MLB API returns winningPercentage as ".569" — render as "0.569"
  const pct = winningPercentage.startsWith(".")
    ? `0${winningPercentage}`
    : winningPercentage;

  const rankClause =
    divisionGamesBack && divisionGamesBack !== "-"
      ? `${ordinal(divisionRank)} in NL Central (${divisionGamesBack} GB)`
      : `${ordinal(divisionRank)} in NL Central`;

  const segments = [`${wins}-${losses} (${pct})`];
  if (streakCode) segments.push(streakCode);
  segments.push(rankClause);

  return `\u{1F4CB} Record/streak/rank: ${segments.join(" / ")}`;
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
