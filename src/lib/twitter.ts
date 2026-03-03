import { TwitterApi } from "twitter-api-v2";

let client: TwitterApi | null = null;

function getClient(): TwitterApi {
  if (!client) {
    client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!.trim(),
      appSecret: process.env.TWITTER_API_SECRET!.trim(),
      accessToken: process.env.TWITTER_ACCESS_TOKEN!.trim(),
      accessSecret: process.env.TWITTER_ACCESS_SECRET!.trim(),
    });
  }
  return client;
}

export interface TweetResult {
  tweetId: string;
  error?: undefined;
}

export interface TweetError {
  tweetId?: undefined;
  error: string;
}

/**
 * Post a tweet. Returns the tweet ID on success, or an error string.
 * Never throws — callers can fire-and-forget safely.
 */
export async function postTweet(
  text: string
): Promise<TweetResult | TweetError> {
  if (process.env.TWITTER_ENABLED?.trim() !== "true") {
    console.log("[twitter] TWITTER_ENABLED is not true, skipping tweet");
    return { error: "TWITTER_ENABLED is not true" };
  }

  try {
    const { data } = await getClient().v2.tweet(text);
    console.log("[twitter] Tweet posted:", data.id);
    return { tweetId: data.id };
  } catch (err: any) {
    const message =
      err?.data ? JSON.stringify(err.data) : err instanceof Error ? err.message : String(err);
    console.error("[twitter] Failed to post tweet:", message);
    return { error: message };
  }
}
