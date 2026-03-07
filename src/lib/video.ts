import { put } from "@vercel/blob";

/**
 * Download an mp4 from a remote URL and re-host it on Vercel Blob.
 * Returns the public blob URL on success, or null on failure.
 *
 * Vercel Blob provides direct-access URLs with correct Content-Type headers,
 * which is required for Warpcast to render native inline video players.
 * MLB CDN URLs involve redirects/auth tokens that cause unfurler timeouts.
 */
export async function rehostVideo(
  mp4Url: string,
  slug: string
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
    return blob.url;
  } catch (err) {
    console.error("[video] Re-host failed:", err);
    return null;
  }
}
