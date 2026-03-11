import { put } from "@vercel/blob";
import { saveVideoBlob } from "./store";

/**
 * Download an mp4 from a remote URL, re-host it on Vercel Blob, and return
 * the direct blob URL for the cast embed.
 *
 * Warpcast plays direct mp4 URLs as native inline video. OG wrapper pages
 * only render as link previews (image + title), not playable video.
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

    // Store blob URL in Redis (kept for poster lookup / debugging)
    await saveVideoBlob(slug, { blobUrl: blob.url, posterUrl });

    // Return the direct mp4 blob URL — Warpcast plays it as native video.
    // (OG wrapper pages render as link previews, not inline video.)
    console.log(`[video] Embed URL (direct mp4): ${blob.url}`);
    return blob.url;
  } catch (err) {
    console.error("[video] Re-host failed:", err);
    return null;
  }
}
