import type { NextApiRequest, NextApiResponse } from "next";
import { getVideoBlob } from "../../../src/lib/store";

/**
 * OG video wrapper page.
 *
 * Warpcast's unfurler doesn't render raw mp4 URLs — it needs an HTML page
 * with og:video meta tags. This endpoint looks up the Vercel Blob mp4 URL
 * from Redis (stored during video re-hosting) and serves minimal HTML with
 * the proper OG tags for native inline video playback.
 *
 * Embed URL: /api/video/{gamePk}  (short, under Farcaster's 256-byte limit)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const slug = req.query.slug as string;

  const data = await getVideoBlob(slug);
  if (!data) {
    return res.status(404).json({ error: "Video not found" });
  }

  const { blobUrl, posterUrl } = data;
  const title = "Cubs Highlight";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:video" content="${escapeHtml(blobUrl)}" />
  <meta property="og:video:secure_url" content="${escapeHtml(blobUrl)}" />
  <meta property="og:video:type" content="video/mp4" />
  <meta property="og:video:width" content="1280" />
  <meta property="og:video:height" content="720" />
  ${posterUrl ? `<meta property="og:image" content="${escapeHtml(posterUrl)}" />` : ""}
</head>
<body>
  <video src="${escapeHtml(blobUrl)}" controls autoplay style="max-width:100%"></video>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  return res.status(200).send(html);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
