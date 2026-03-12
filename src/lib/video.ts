import { fcFetch } from "./farcaster-auth";

/**
 * Upload an mp4 to Farcaster's video infrastructure and return a native
 * playback URL that renders as inline video in Farcaster clients.
 *
 * Flow: download mp4 → prepare upload → TUS upload to stream.farcaster.xyz →
 * poll until ready → return embed URL.
 */
export async function uploadToFarcasterStream(
  mp4Url: string,
  _slug: string
): Promise<string | null> {
  try {
    // 1. Download the mp4 into memory
    console.log(`[video] Downloading mp4: ${mp4Url}`);
    const dlResponse = await fetch(mp4Url);
    if (!dlResponse.ok || !dlResponse.body) {
      console.error(`[video] Failed to fetch mp4: ${dlResponse.status}`);
      return null;
    }
    const videoBuffer = new Uint8Array(await dlResponse.arrayBuffer());
    const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`[video] Downloaded ${sizeMB}MB`);

    // 2. Prepare the upload — get a videoId and TUS upload URL
    console.log("[video] Preparing Farcaster video upload...");
    const prepareRes = await fcFetch("/v1/prepare-video-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoSizeBytes: videoBuffer.length,
        supportsDynamicUpload: true,
      }),
    });

    if (!prepareRes.ok) {
      const errText = await prepareRes.text();
      console.error(`[video] prepare-video-upload failed: ${prepareRes.status} ${errText}`);
      return null;
    }

    const prepareData = await prepareRes.json();
    const result = prepareData.result;
    const videoId: string | undefined = result?.videoId;
    const uploadUrl: string | undefined = result?.uploadUrl;

    if (!videoId || !uploadUrl) {
      console.error("[video] Missing videoId/uploadUrl:", JSON.stringify(prepareData));
      return null;
    }

    console.log(`[video] Video prepared: ${videoId}`);

    // 3. Upload via TUS protocol to the provided upload URL
    console.log(`[video] Uploading ${sizeMB}MB via TUS...`);
    const uploaded = await tusUpload(uploadUrl, videoBuffer);

    if (!uploaded) {
      console.error("[video] TUS upload failed");
      return null;
    }

    console.log("[video] Upload complete, waiting for processing...");

    // 4. Poll until the video is ready
    const embedUrl = await pollForReady(videoId);

    if (embedUrl) {
      // Wait for Farcaster's embed classifier to index the video.
      // Without this delay, POST /v2/casts receives the URL before the
      // classifier knows it's a video, resulting in "No preview found".
      console.log("[video] Waiting 15s for embed classifier to index...");
      await new Promise((r) => setTimeout(r, 15_000));
    }

    return embedUrl;
  } catch (err) {
    console.error("[video] Farcaster video upload failed:", err);
    return null;
  }
}

/**
 * Upload video using TUS protocol (resumable upload).
 * Uses a single creation + data request for simplicity since files are <100MB.
 */
async function tusUpload(endpoint: string, data: Uint8Array): Promise<boolean> {
  try {
    // TUS creation request — no Content-Type (causes 415 on Farcaster's proxy)
    const createRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(data.length),
        "Upload-Metadata": `filename ${btoa("video.mp4")},filetype ${btoa("video/mp4")}`,
      },
    });

    if (createRes.status !== 201 && !createRes.ok) {
      console.error(`[video] TUS create failed: ${createRes.status} ${await createRes.text()}`);
      return false;
    }

    // The Location header contains the Cloudflare Stream URL for the PATCH upload
    const location = createRes.headers.get("location");
    if (!location) {
      console.error("[video] TUS create returned no Location header");
      return false;
    }
    console.log(`[video] TUS location: ${location}`);

    // TUS PATCH — send the full file in one go to the Cloudflare Stream URL
    const patchRes = await fetch(location, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
      },
      body: data as unknown as BodyInit,
    });

    if (patchRes.status === 204 || patchRes.ok) {
      console.log("[video] TUS upload succeeded");
      return true;
    }

    console.error(`[video] TUS PATCH failed: ${patchRes.status} ${await patchRes.text()}`);
    return false;
  } catch (err) {
    console.error("[video] TUS upload error:", err);
    return false;
  }
}

/**
 * Poll Farcaster's uploaded-video endpoint until the video is ready.
 * Timeout after ~3 minutes.
 */
async function pollForReady(videoId: string): Promise<string | null> {
  const maxAttempts = 36; // 36 * 5s = 180s
  const interval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));

    try {
      const res = await fcFetch(`/v1/uploaded-video?videoId=${videoId}`);

      if (!res.ok) {
        console.error(`[video] Poll failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const video = data.result?.video;
      const embed = video?.embed;

      // Check for ready state
      if (embed?.url || embed?.sourceUrl) {
        const embedUrl = embed.sourceUrl || embed.url;
        console.log(`[video] Video ready! Embed URL: ${embedUrl}`);
        if (embed.width) console.log(`[video] Dimensions: ${embed.width}x${embed.height}`);
        return embedUrl;
      }

      const state = video?.state || data.result?.state;

      if (state === "error" || state === "failed") {
        console.error("[video] Processing failed:", JSON.stringify(data.result));
        return null;
      }

      console.log(`[video] Processing... (${state || "unknown"}, attempt ${i + 1}/${maxAttempts})`);
    } catch (err) {
      console.error(`[video] Poll error:`, err);
    }
  }

  console.error("[video] Timed out waiting for processing");
  return null;
}
