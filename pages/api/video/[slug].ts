import type { NextApiRequest, NextApiResponse } from "next";

/**
 * OG video wrapper page.
 *
 * Warpcast's unfurler doesn't render raw mp4 URLs — it needs an HTML page
 * with og:video meta tags. This endpoint serves minimal HTML whose OG tags
 * point to the Vercel Blob mp4 URL.
 *
 * Usage: /api/video/<slug>?url=<blob-mp4-url>&poster=<image-url>
 *
 * The cast embed URL points here; Warpcast unfurls this page and discovers
 * the og:video tag, rendering a native inline video player.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const videoUrl = req.query.url as string;
  const posterUrl = req.query.poster as string | undefined;
  const title = (req.query.title as string) || "Cubs Highlight";

  if (!videoUrl) {
    return res.status(400).json({ error: "url query param required" });
  }

  const ogImage = posterUrl || "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:type" content="video.other" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:video" content="${escapeHtml(videoUrl)}" />
  <meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}" />
  <meta property="og:video:type" content="video/mp4" />
  <meta property="og:video:width" content="1280" />
  <meta property="og:video:height" content="720" />
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ""}
</head>
<body>
  <video src="${escapeHtml(videoUrl)}" controls autoplay style="max-width:100%"></video>
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
