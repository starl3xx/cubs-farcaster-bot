import { put } from "@vercel/blob";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://cubs-farcaster-bot.vercel.app";

export interface RehostResult {
  /** The OG wrapper URL to use as the cast embed */
  embedUrl: string;
  /** The raw Vercel Blob mp4 URL */
  blobUrl: string;
}

/**
 * Download an mp4 from a remote URL, re-host it on Vercel Blob, and return
 * an OG wrapper URL that Warpcast can unfurl for native video playback.
 *
 * Warpcast doesn't render raw mp4 file URLs — it needs an HTML page with
 * og:video meta tags. The OG wrapper at /api/video/[slug] serves that HTML.
 */
export async function rehostVideo(
  mp4Url: string,
  slug: string,
  posterUrl?: string
): Promise<RehostResult | null> {
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

    // Build OG wrapper URL — this is what gets embedded in the cast
    const params = new URLSearchParams({ url: blob.url });
    if (posterUrl) params.set("poster", posterUrl);
    const embedUrl = `${APP_URL}/api/video/${slug}?${params.toString()}`;

    console.log(`[video] OG wrapper URL: ${embedUrl}`);
    return { embedUrl, blobUrl: blob.url };
  } catch (err) {
    console.error("[video] Re-host failed:", err);
    return null;
  }
}
