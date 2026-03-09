import { put } from "@vercel/blob";
import { saveVideoBlob } from "./store";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cubs-farcaster-bot.vercel.app";

/**
 * Download an mp4 from a remote URL, re-host it on Vercel Blob, store the
 * blob URL in Redis, and return a short OG wrapper URL for the cast embed.
 *
 * The embed URL is just /api/video/{slug} — no query params — to stay well
 * under Farcaster's 256-byte embed limit. The OG wrapper page looks up the
 * blob URL from Redis and serves og:video meta tags.
 */
export async function rehostVideo(
  mp4Url: string,
  slug: string,
  posterUrl?: string
): Promise<string | null> {
  try {
    const response = await fetch(mp4Url);
    if (!response.ok || !response.body) {
      console.error(`[video] Failed to fetch mp4: ${response.status} ${mp4Url}`);
      return null;
    }

    const filename = `cubs-highlight-${slug}.mp4`;

    // Stream the response body directly to Vercel Blob (no memory buffering)
    const blob = await put(filename, response.body, {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
    });

    console.log(`[video] Re-hosted to Vercel Blob: ${blob.url}`);

    // Store blob URL in Redis so the OG wrapper page can look it up
    await saveVideoBlob(slug, { blobUrl: blob.url, posterUrl });

    // Short embed URL — no query params, under 256 bytes
    const embedUrl = `${APP_URL}/api/video/${slug}`;
    console.log(`[video] Embed URL: ${embedUrl}`);
    return embedUrl;
  } catch (err) {
    console.error("[video] Re-host failed:", err);
    return null;
  }
}
