import { CUBS_TEAM_ID } from "./config";
import type { GameFeed, GameContent, Playback } from "../types/mlb";

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
 * Spring Training: Cubs shut out Cardinals 2-0 — FINAL
 *
 * STL  000 000 000  0R 6H 0E
 * CHC  000 010 10x  2R 6H 0E
 *
 * W: Assad | L: King | S: Wicks
 *
 * Wrigley Field
 */
export function formatBoxScoreCast(
  feed: GameFeed,
  gameNumber?: number
): string {
  const { gameData, liveData } = feed;
  const { linescore, decisions } = liveData;
  const away = gameData.teams.away;
  const home = gameData.teams.home;

  const awayRuns = linescore.teams.away.runs;
  const homeRuns = linescore.teams.home.runs;

  const cubsAreHome = home.id === CUBS_TEAM_ID;
  const cubsWon = cubsAreHome ? homeRuns > awayRuns : awayRuns > homeRuns;
  const opponent = cubsAreHome ? away : home;
  const cubsRuns = cubsAreHome ? homeRuns : awayRuns;
  const opponentRuns = cubsAreHome ? awayRuns : homeRuns;

  // Game type prefix (Spring Training, Postseason, etc.)
  const gameType = gameData.game?.type || "R";
  const gameTypeLabel = GAME_TYPE_LABELS[gameType];
  const prefix = gameTypeLabel ? `${gameTypeLabel}: ` : "";

  // Headline
  const verb = getVerb(cubsWon, cubsRuns, opponentRuns);
  const doubleheaderTag =
    gameNumber && gameNumber > 1 ? ` (Game ${gameNumber})` : "";
  const extraInnings =
    linescore.currentInning > 9
      ? ` (${linescore.currentInning} inn.)`
      : "";
  const headline = cubsWon
    ? `\u{1F4CB} ${prefix}Cubs ${verb} ${opponent.teamName} ${cubsRuns}-${opponentRuns}${extraInnings} — FINAL${doubleheaderTag}`
    : `\u{1F4CB} ${prefix}${opponent.teamName} ${verb} Cubs ${opponentRuns}-${cubsRuns}${extraInnings} — FINAL${doubleheaderTag}`;

  // Inning-by-inning line score
  const lineScore = formatLineScore(linescore, away.abbreviation, home.abbreviation);

  // Decisions line
  const decisionsLine = formatDecisions(decisions);

  // Venue
  const venue = gameData.venue.name;

  const parts = [headline, "", lineScore];
  if (decisionsLine) parts.push("", `\u26BE ${decisionsLine}`);
  parts.push("", `\u{1F3DF}\uFE0F ${venue}`);

  return parts.join("\n");
}

function getVerb(
  cubsWon: boolean,
  cubsRuns: number,
  opponentRuns: number
): string {
  const diff = Math.abs(cubsRuns - opponentRuns);
  const loserRuns = cubsWon ? opponentRuns : cubsRuns;

  if (cubsWon) {
    if (loserRuns === 0) return "shut out";
    if (diff === 1) return "edge";
    if (diff >= 7) return "rout";
    if (diff >= 5) return "cruise past";
    return "beat";
  } else {
    if (cubsRuns === 0) return "shut out";
    if (diff === 1) return "edge";
    if (diff >= 7) return "rout";
    return "beat";
  }
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
  if (decisions.winner) parts.push(`W: ${decisions.winner.fullName}`);
  if (decisions.loser) parts.push(`L: ${decisions.loser.fullName}`);
  if (decisions.save) parts.push(`S: ${decisions.save.fullName}`);

  return parts.join(" | ");
}

export interface MediaEmbeds {
  embeds: string[];
  /** Raw mp4 URL from MLB CDN — needs re-hosting before embedding */
  videoMp4Url?: string;
  /** Editorial recap photo URL — used as video poster/thumbnail */
  posterUrl?: string;
}

/**
 * Extract the best media embed from game content.
 * Priority: recap video (mp4) > editorial recap photo > any highlight video
 *
 * Returns both the embed URLs and the raw mp4 URL separately so the caller
 * can re-host the video on a fast CDN (Vercel Blob) for native playback.
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
    embeds.push(videoResult.mp4Url);
    videoMp4Url = videoResult.mp4Url;
  } else {
    // Fall back to editorial recap photo only when no video is available
    if (posterUrl) {
      embeds.push(posterUrl);
    }
  }

  return { embeds, videoMp4Url, posterUrl };
}

interface HighlightResult {
  mp4Url: string;
}

/**
 * Extract the recap highlight video mp4 URL from game content.
 * Returns the raw mp4 URL for re-hosting on a fast CDN.
 */
export function extractHighlightUrl(content: GameContent): HighlightResult | null {
  // Try media.epg first (newer format)
  if (content.media?.epg) {
    for (const epg of content.media.epg) {
      if (epg.title === "Recap" && epg.items?.length) {
        const url = findBestPlayback(epg.items[0].playbacks);
        if (url) return { mp4Url: url };
      }
    }
  }

  // Try media.highlights (another path)
  if (content.media?.highlights?.highlights?.items) {
    for (const item of content.media.highlights.highlights.items) {
      if (isRecapItem(item)) {
        const url = findBestPlayback(item.playbacks);
        if (url) return { mp4Url: url };
      }
    }
  }

  // Fall back to top-level highlights
  if (content.highlights?.highlights?.items) {
    for (const item of content.highlights.highlights.items) {
      if (isRecapItem(item)) {
        const url = findBestPlayback(item.playbacks);
        if (url) return { mp4Url: url };
      }
    }
  }

  return null;
}

/**
 * Extract the top Cubs play highlight when no recap video exists.
 * Filters for in-game-highlight videos tagged with the Cubs team.
 * Uses in-game-highlight (not game-story-highlight) because exhibition
 * games don't have the game-story-highlight taxonomy.
 */
function extractCubsHighlightUrl(content: GameContent): HighlightResult | null {
  const items = content.highlights?.highlights?.items;
  if (!items?.length) return null;

  const cubsTag = `teamid-${CUBS_TEAM_ID}`;

  for (const item of items) {
    if (item.type !== "video") continue;

    const kw = item.keywordsAll || [];
    const isCubs = kw.some((k) => k.value === cubsTag);
    const isPlayHighlight = kw.some((k) => k.value === "in-game-highlight");

    if (isCubs && isPlayHighlight) {
      const url = findBestPlayback(item.playbacks);
      if (url) return { mp4Url: url };
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

  // Prefer mp4Avc (best Farcaster compatibility)
  const mp4Avc = playbacks.find((p) => p.name === "mp4Avc");
  if (mp4Avc) return mp4Avc.url;

  // Fall back to any mp4
  const mp4 = playbacks.find((p) => p.name?.toLowerCase().includes("mp4"));
  if (mp4) return mp4.url;

  // Last resort: first available
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
  const parts = [`Cubs News: ${title}`];
  if (author) parts.push("", `by ${author}`);
  return parts.join("\n");
}
