import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import { CHANNEL_ID } from "./config";

let client: NeynarAPIClient | null = null;
let channelParentUrl: string | null = null;

function getClient(): NeynarAPIClient {
  if (!client) {
    const config = new Configuration({
      apiKey: process.env.NEYNAR_API_KEY!,
    });
    client = new NeynarAPIClient(config);
  }
  return client;
}

/**
 * Look up the channel's protocol-level parent_url via Neynar API.
 * Cached after first call since it never changes.
 */
async function getChannelParentUrl(): Promise<string> {
  if (channelParentUrl) return channelParentUrl;

  const response = await getClient().lookupChannel({ id: CHANNEL_ID });
  const url = response.channel.parent_url;
  if (!url) {
    throw new Error(`Channel "${CHANNEL_ID}" has no parent_url`);
  }
  console.log(`[neynar] Resolved channel "${CHANNEL_ID}" parent_url: ${url}`);
  channelParentUrl = url;
  return url;
}

export interface PostResult {
  hash: string;
  error?: undefined;
}

export interface PostError {
  hash?: undefined;
  error: string;
}

interface PostOptions {
  embeds?: { url: string }[];
  idem?: string;
}

/**
 * Post a cast to the /cubs channel.
 * Uses the channel's protocol-level parent_url to ensure proper routing.
 */
export async function postToChannel(
  text: string,
  options: PostOptions = {}
): Promise<PostResult | PostError> {
  if (process.env.BOT_ENABLED !== "true") {
    console.log("[neynar] BOT_ENABLED is not true, skipping post");
    console.log("[neynar] Would have posted:", text.substring(0, 100) + "...");
    return { error: "BOT_ENABLED is not true" };
  }

  try {
    const parentUrl = await getChannelParentUrl();

    const response = await getClient().publishCast({
      signerUuid: process.env.NEYNAR_SIGNER_UUID!,
      text,
      parent: parentUrl,
      channelId: CHANNEL_ID,
      embeds: options.embeds?.map((e) => ({ url: e.url })),
      idem: options.idem,
    });

    console.log("[neynar] Cast published:", response.cast.hash);
    return { hash: response.cast.hash };
  } catch (err: any) {
    const message = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err instanceof Error
        ? err.message
        : String(err);
    console.error("[neynar] Failed to publish cast:", message);
    return { error: message };
  }
}
