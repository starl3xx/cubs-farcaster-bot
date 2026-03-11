const CF_API = "https://api.cloudflare.com/client/v4";

/**
 * Upload an mp4 to Cloudflare Stream and return an HLS playback URL.
 *
 * Flow: download mp4 → upload to Cloudflare Stream via direct upload →
 * poll until ready → return HLS URL using customer subdomain.
 */
export async function uploadToCloudflareStream(
  mp4Url: string,
  slug: string
): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const customerSubdomain = process.env.CLOUDFLARE_CUSTOMER_SUBDOMAIN;

  if (!accountId || !apiToken || !customerSubdomain) {
    console.error("[video] Missing Cloudflare Stream env vars");
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

    // 2. Request a direct upload URL from Cloudflare Stream
    const createRes = await fetch(
      `${CF_API}/accounts/${accountId}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: 600, // 10 min max for highlights
          meta: { name: `cubs-highlight-${slug}` },
        }),
      }
    );

    if (!createRes.ok) {
      console.error(`[video] CF direct_upload failed: ${createRes.status} ${await createRes.text()}`);
      return null;
    }

    const createData = await createRes.json();
    const uploadUrl: string = createData.result?.uploadURL;
    const videoUid: string = createData.result?.uid;

    if (!uploadUrl || !videoUid) {
      console.error("[video] Missing upload data from CF:", JSON.stringify(createData));
      return null;
    }

    console.log(`[video] CF video created: ${videoUid}`);

    // 3. Upload the video file
    const formData = new FormData();
    formData.append("file", new Blob([videoBuffer], { type: "video/mp4" }), `${slug}.mp4`);

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error(`[video] CF upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
      return null;
    }

    console.log("[video] Upload complete, waiting for processing...");

    // 4. Poll until the video is ready
    const playbackUrl = await pollForReady(accountId, apiToken, videoUid, customerSubdomain);
    return playbackUrl;
  } catch (err) {
    console.error("[video] Cloudflare Stream upload failed:", err);
    return null;
  }
}

/**
 * Poll Cloudflare Stream video status until ready, then return the HLS playback URL.
 * Timeout after ~3 minutes.
 */
async function pollForReady(
  accountId: string,
  apiToken: string,
  videoUid: string,
  customerSubdomain: string
): Promise<string | null> {
  const maxAttempts = 36; // 36 * 5s = 180s
  const interval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(
      `${CF_API}/accounts/${accountId}/stream/${videoUid}`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );

    if (!res.ok) {
      console.error(`[video] Poll failed: ${res.status}`);
      continue;
    }

    const data = await res.json();
    const status = data.result?.status;

    if (status?.state === "ready") {
      // Use customer subdomain for playback URL
      const url = `https://${customerSubdomain}/${videoUid}/manifest/video.m3u8`;
      console.log(`[video] Video ready! Playback URL: ${url}`);
      return url;
    }

    if (status?.state === "error") {
      console.error("[video] CF processing failed:", status?.errorReasonCode);
      return null;
    }

    console.log(`[video] Processing... (${status?.state}, attempt ${i + 1}/${maxAttempts})`);
  }

  console.error("[video] Timed out waiting for CF processing");
  return null;
}
