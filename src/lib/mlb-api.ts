import { MLB_API_BASE, CUBS_TEAM_ID } from "./config";
import type {
  ScheduleResponse,
  GameFeed,
  GameContent,
} from "../types/mlb";

export async function getSchedule(date: string): Promise<ScheduleResponse> {
  const url = `${MLB_API_BASE}/api/v1/schedule?teamId=${CUBS_TEAM_ID}&sportId=1&date=${date}&hydrate=team`;
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
