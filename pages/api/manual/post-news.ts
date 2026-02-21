import type { NextApiRequest, NextApiResponse } from "next";
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

  const url = req.query.url as string;
  const title = (req.query.title as string) || "Test news article";
  const author = req.query.author as string | undefined;

  if (!url) {
    return res.status(400).json({ error: "url query param required" });
  }

  const force = req.query.force === "true";
  const guid = url; // Use URL as guid for manual posts

  try {
    if (!force && (await isNewsPosted(guid))) {
      return res.status(200).json({
        ok: true,
        message: "Already posted. Use ?force=true to re-post.",
      });
    }

    const text = formatNewsCast(title, author, url);

    const result = await postToChannel(text, {
      embeds: [{ url }],
      idem: force ? undefined : `news-${guid}`,
    });

    if (result.hash) {
      await markNewsPosted(guid, result.hash);
    }

    return res.status(200).json({
      ok: true,
      text,
      url,
      posted: !!result.hash,
      castHash: result.hash || null,
      error: result.error || null,
    });
  } catch (err) {
    console.error("[post-news] Error:", err);
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
