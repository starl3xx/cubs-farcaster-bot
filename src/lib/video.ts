const LIVEPEER_API = "https://livepeer.studio/api";

/**
 * Upload an mp4 to Livepeer Studio (free tier) and return an HLS playback URL.
 *
 * Flow: download mp4 → request upload URL from Livepeer → PUT mp4 →
 * poll until transcoded → return playback URL for native Warpcast video.
 */
export async function uploadToLivepeer(
  mp4Url: string,
  slug: string
): Promise<string | null> {
  const apiKey = process.env.LIVEPEER_API_KEY;
  if (!apiKey) {
    console.error("[video] LIVEPEER_API_KEY not set");
    return null;
  }

  try {
    // 1. Download the mp4 into memory
    console.log(`[video] Downloading mp4: ${mp4Url}`);
    const dlResponse = await fetch(mp4Url);
    if (!dlResponse.ok || !dlResponse.body) {
      console.error(`[video] Failed to fetch mp4: ${dlResponse.status}`);
      return null;
    }
    const videoBuffer = Buffer.from(await dlResponse.arrayBuffer());
    console.log(`[video] Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);

    // 2. Request a direct upload URL from Livepeer
    const uploadReq = await fetch(`${LIVEPEER_API}/asset/request-upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `cubs-highlight-${slug}`,
      }),
    });

    if (!uploadReq.ok) {
      console.error(`[video] Livepeer request-upload failed: ${uploadReq.status} ${await uploadReq.text()}`);
      return null;
    }

    const uploadData = await uploadReq.json();
    const tusUrl: string = uploadData.tusEndpoint;
    const assetId: string = uploadData.asset?.id;
    const playbackId: string = uploadData.asset?.playbackId;

    if (!tusUrl || !assetId || !playbackId) {
      console.error("[video] Missing upload data from Livepeer:", JSON.stringify(uploadData));
      return null;
    }

    console.log(`[video] Livepeer asset created: ${assetId}, playbackId: ${playbackId}`);

    // 3. Upload via direct PUT (simpler than TUS for single-shot uploads)
    // Use the direct upload URL if available, otherwise fall back to TUS
    const directUrl = uploadData.url;
    if (directUrl) {
      const putRes = await fetch(directUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: videoBuffer,
      });
      if (!putRes.ok) {
        console.error(`[video] Direct upload failed: ${putRes.status} ${await putRes.text()}`);
        return null;
      }
    } else {
      // TUS upload: create + upload in one PATCH
      const createRes = await fetch(tusUrl, {
        method: "POST",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(videoBuffer.length),
          "Content-Type": "application/offset+octet-stream",
        },
      });
      const location = createRes.headers.get("Location");
      if (!location) {
        console.error("[video] TUS create failed — no Location header");
        return null;
      }

      const patchRes = await fetch(location, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": "0",
          "Content-Type": "application/offset+octet-stream",
        },
        body: videoBuffer,
      });
      if (!patchRes.ok) {
        console.error(`[video] TUS upload failed: ${patchRes.status}`);
        return null;
      }
    }

    console.log("[video] Upload complete, waiting for transcoding...");

    // 4. Poll until the asset is ready (transcoded)
    const playbackUrl = await pollForReady(apiKey, assetId, playbackId);
    return playbackUrl;
  } catch (err) {
    console.error("[video] Livepeer upload failed:", err);
    return null;
  }
}

/**
 * Poll Livepeer asset status until ready, then return the HLS playback URL.
 * Timeout after ~3 minutes.
 */
async function pollForReady(
  apiKey: string,
  assetId: string,
  playbackId: string
): Promise<string | null> {
  const maxAttempts = 36; // 36 * 5s = 180s = 3 min
  const interval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(`${LIVEPEER_API}/asset/${assetId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.error(`[video] Poll failed: ${res.status}`);
      continue;
    }

    const asset = await res.json();
    const status = asset.status?.phase;

    if (status === "ready") {
      const url = asset.playbackUrl || `https://lp-playback.com/hls/${playbackId}/index.m3u8`;
      console.log(`[video] Asset ready! Playback URL: ${url}`);
      return url;
    }

    if (status === "failed") {
      console.error("[video] Livepeer transcoding failed:", asset.status?.errorMessage);
      return null;
    }

    console.log(`[video] Transcoding... (${status}, attempt ${i + 1}/${maxAttempts})`);
  }

  console.error("[video] Timed out waiting for Livepeer transcoding");
  return null;
}
