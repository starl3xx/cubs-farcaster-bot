import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import { CHANNEL_ID } from "./config";

let client: NeynarAPIClient | null = null;

function getClient(): NeynarAPIClient {
  if (!client) {
    const config = new Configuration({
      apiKey: process.env.NEYNAR_API_KEY!,
    });
    client = new NeynarAPIClient(config);
  }
  return client;
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
 * Returns the cast hash on success, or null on failure (never throws).
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
    const response = await getClient().publishCast({
      signerUuid: process.env.NEYNAR_SIGNER_UUID!,
      text,
      channelId: CHANNEL_ID,
      embeds: options.embeds?.map((e) => ({ url: e.url })),
      idem: options.idem,
    });

    console.log("[neynar] Cast published:", response.cast.hash);
    return { hash: response.cast.hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[neynar] Failed to publish cast:", message);
    return { error: message };
  }
}
