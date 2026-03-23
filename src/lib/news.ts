import { XMLParser } from "fast-xml-parser";
import { CUBS_RSS_URL, NEWS_LOOKBACK_MS, NEWS_SIGNIFICANCE_THRESHOLD } from "./config";
import type { RssItem } from "../types/mlb";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface ScoredNewsItem {
  title: string;
  link: string;
  guid: string;
  author?: string;
  pubDate: Date;
  score: number;
}

/**
 * Fetch and parse the Cubs RSS feed, returning scored items that pass
 * the significance threshold and fall within the lookback window.
 */
export async function fetchSignificantNews(): Promise<ScoredNewsItem[]> {
  const res = await fetch(CUBS_RSS_URL);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const items: RssItem[] = parsed?.rss?.channel?.item || [];

  if (!Array.isArray(items)) return [];

  const cutoff = Date.now() - NEWS_LOOKBACK_MS;

  return items
    .map((item) => {
      const pubDate = new Date(item.pubDate);
      const author = item["dc:creator"] || item.creator;
      const score = scoreSignificance(item.title, item.description, author);

      return {
        title: item.title,
        link: item.link,
        guid: item.guid || item.link,
        author,
        pubDate,
        score,
      };
    })
    .filter((item) => item.pubDate.getTime() > cutoff)
    .filter((item) => item.score >= NEWS_SIGNIFICANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

/**
 * Score a news item's significance (0-100) using keyword matching.
 * Higher scores = more important news worth posting.
 */
export function scoreSignificance(
  title: string,
  description?: string,
  author?: string
): number {
  const text = `${title} ${description || ""}`.toLowerCase();
  let score = 0;

  // Transaction keywords (+40)
  if (/\b(sign|signs|signed|signing|trade|traded|trading|acquire|acquired|acquisition)\b/.test(text)) {
    score += 40;
  }

  // Significant roster/career moves (+40)
  if (/\b(injur|disabled list|\bil\b|dfa|designat|retir|extension|extend|fired|hired|manager|coaching)\b/.test(text)) {
    score += 40;
  }

  // Notable game events (+30)
  if (/\b(call.?up|promoted|walk.?off|postseason|playoff|record|no.?hit|perfect game|cycle)\b/.test(text)) {
    score += 30;
  }

  // Milestone/event keywords (+25)
  if (/\b(all.?star|opening day|world series|draft|prospect|top.?\d+)\b/.test(text)) {
    score += 25;
  }

  // Low-value content penalties
  if (/\b(trivia|quiz|riddle|puzzle)\b/.test(text)) {
    score -= 50;
  }
  if (/\b(podcast|fun fact|promo|sweepstakes|giveaway|contest)\b/.test(text)) {
    score -= 30;
  }

  // Beat writer bonus (+10)
  if (author?.toLowerCase().includes("jordan bastian")) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}
