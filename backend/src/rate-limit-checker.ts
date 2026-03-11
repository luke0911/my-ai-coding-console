/**
 * RateLimitChecker: Makes a minimal Anthropic API call to read rate limit headers.
 * Only works when ANTHROPIC_API_KEY is set. Returns null on failure.
 */

import https from "https";

export interface RateLimitInfo {
  tokensLimit: number;
  tokensRemaining: number;
  tokensReset: string;
  requestsLimit: number;
  requestsRemaining: number;
}

let lastCheck: { info: RateLimitInfo; at: number } | null = null;
const COOLDOWN_MS = 10_000; // Don't check more than once per 10s

export async function checkRateLimit(apiKey: string): Promise<RateLimitInfo | null> {
  // Rate-limit the checker itself
  if (lastCheck && Date.now() - lastCheck.at < COOLDOWN_MS) {
    return lastCheck.info;
  }

  try {
    const info = await doCheck(apiKey);
    if (info) {
      lastCheck = { info, at: Date.now() };
    }
    return info;
  } catch (err) {
    console.error("[RateLimitChecker] Error:", err);
    return lastCheck?.info ?? null;
  }
}

function doCheck(apiKey: string): Promise<RateLimitInfo | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
      (res) => {
        const h = res.headers;
        const info: RateLimitInfo = {
          tokensLimit: parseInt(h["anthropic-ratelimit-tokens-limit"] as string) || -1,
          tokensRemaining: parseInt(h["anthropic-ratelimit-tokens-remaining"] as string) || -1,
          tokensReset: (h["anthropic-ratelimit-tokens-reset"] as string) || "",
          requestsLimit: parseInt(h["anthropic-ratelimit-requests-limit"] as string) || -1,
          requestsRemaining: parseInt(h["anthropic-ratelimit-requests-remaining"] as string) || -1,
        };

        // Drain response body
        res.on("data", () => {});
        res.on("end", () => resolve(info));
      },
    );

    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}
