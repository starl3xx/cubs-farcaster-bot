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
 *          1  2  3  4  5  6  7  8  9   R  H  E
 * STL      0  0  0  0  0  0  0  0  0   0  6  0
 * CHC      0  0  0  0  1  0  1  0  x   2  6  0
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
    ? `${prefix}Cubs ${verb} ${opponent.teamName} ${cubsRuns}-${opponentRuns}${extraInnings} — FINAL${doubleheaderTag}`
    : `${prefix}${opponent.teamName} ${verb} Cubs ${opponentRuns}-${cubsRuns}${extraInnings} — FINAL${doubleheaderTag}`;

  // Inning-by-inning line score
  const lineScore = formatLineScore(linescore, away.abbreviation, home.abbreviation);

  // Decisions line
  const decisionsLine = formatDecisions(decisions);

  // Venue
  const venue = gameData.venue.name;

  const parts = [headline, "", lineScore];
  if (decisionsLine) parts.push("", decisionsLine);
  parts.push("", venue);

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

  // Header row: inning numbers
  const inningNums = [];
  for (let i = 1; i <= numInnings; i++) {
    inningNums.push(String(i).padStart(2));
  }
  const header = "".padEnd(5) + inningNums.join(" ") + "   R  H  E";

  // Away runs per inning
  const awayInnings = [];
  for (let i = 0; i < numInnings; i++) {
    const inn = innings[i];
    awayInnings.push(inn?.away?.runs !== undefined ? String(inn.away.runs).padStart(2) : "  ");
  }
  const awayLine =
    awayAbbr.padEnd(5) +
    awayInnings.join(" ") +
    `  ${String(linescore.teams.away.runs).padStart(2)}` +
    ` ${String(linescore.teams.away.hits).padStart(2)}` +
    ` ${String(linescore.teams.away.errors).padStart(2)}`;

  // Home runs per inning — use "x" if bottom of last inning wasn't played
  const homeInnings = [];
  for (let i = 0; i < numInnings; i++) {
    const inn = innings[i];
    if (i === numInnings - 1 && inn?.home?.runs === undefined) {
      homeInnings.push(" x");
    } else {
      homeInnings.push(
        inn?.home?.runs !== undefined ? String(inn.home.runs).padStart(2) : "  "
      );
    }
  }
  const homeLine =
    homeAbbr.padEnd(5) +
    homeInnings.join(" ") +
    `  ${String(linescore.teams.home.runs).padStart(2)}` +
    ` ${String(linescore.teams.home.hits).padStart(2)}` +
    ` ${String(linescore.teams.home.errors).padStart(2)}`;

  return [header, awayLine, homeLine].join("\n");
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

/**
 * Extract the best media embed from game content.
 * Priority: recap video (mp4) > editorial recap photo > any highlight video
 */
export function extractMediaEmbeds(content: GameContent): string[] {
  const embeds: string[] = [];

  // 1. Try recap video
  const videoUrl = extractHighlightUrl(content);
  if (videoUrl) {
    embeds.push(videoUrl);
  }

  // 2. Try editorial recap photo (if no video, or as second embed)
  const photoUrl = extractEditorialPhoto(content);
  if (photoUrl && embeds.length < 2) {
    embeds.push(photoUrl);
  }

  return embeds;
}

/**
 * Extract the recap highlight video URL from game content.
 */
export function extractHighlightUrl(content: GameContent): string | null {
  // Try media.epg first (newer format)
  if (content.media?.epg) {
    for (const epg of content.media.epg) {
      if (epg.title === "Recap" && epg.items?.length) {
        const url = findBestPlayback(epg.items[0].playbacks);
        if (url) return url;
      }
    }
  }

  // Try media.highlights (another path)
  if (content.media?.highlights?.highlights?.items) {
    for (const item of content.media.highlights.highlights.items) {
      if (isRecapItem(item)) {
        const url = findBestPlayback(item.playbacks);
        if (url) return url;
      }
    }
  }

  // Fall back to top-level highlights
  if (content.highlights?.highlights?.items) {
    for (const item of content.highlights.highlights.items) {
      if (isRecapItem(item)) {
        const url = findBestPlayback(item.playbacks);
        if (url) return url;
      }
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
