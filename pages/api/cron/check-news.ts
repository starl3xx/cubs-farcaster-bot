import type { NextApiRequest, NextApiResponse } from "next";
import { fetchSignificantNews } from "../../../src/lib/news";
import { formatNewsCast } from "../../../src/lib/formatter";
import { postToChannel } from "../../../src/lib/neynar";
import { isNewsPosted, markNewsPosted } from "../../../src/lib/store";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!verifyAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (process.env.NEWS_ENABLED !== "true") {
    return res.status(200).json({ ok: true, message: "News posting disabled" });
  }

  try {
    const items = await fetchSignificantNews();
    const results: Record<string, string> = {};

    for (const item of items) {
      // Dedup check
      if (await isNewsPosted(item.guid)) {
        results[item.guid] = "already posted";
        continue;
      }

      // Format and post
      const text = formatNewsCast(item.title, item.author, item.link);

      const result = await postToChannel(text, {
        embeds: [{ url: item.link }],
        idem: `news-${item.guid}`,
      });

      if (result.hash) {
        await markNewsPosted(item.guid, result.hash);
        results[item.guid] = `posted (score: ${item.score}): ${result.hash}`;
      } else {
        results[item.guid] = `failed (score: ${item.score}): ${result.error}`;
      }
    }

    return res.status(200).json({
      ok: true,
      itemsFound: items.length,
      results,
    });
  } catch (err) {
    console.error("[check-news] Error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function verifyAuth(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;

  if (req.headers["x-cron-secret"] === secret) return true;

  return false;
}
