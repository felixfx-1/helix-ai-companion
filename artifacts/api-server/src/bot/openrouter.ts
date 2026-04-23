const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_KEYS = [
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
  "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",
];

export const MODELS = {
  DEFAULT: "google/gemini-2.5-flash",
  VISION:  "google/gemini-2.5-flash",
  IMAGE:   "google/gemini-2.5-flash-image",
  DEEP:    "deepseek/deepseek-r1-0528",
  SEARCH:  "perplexity/sonar-pro",
  CLAUDE:  "anthropic/claude-sonnet-4",
  GPT:     "openai/gpt-4o-search-preview",
  GEMINI_PRO: "google/gemini-2.5-pro",
};

export const MODEL_ALIASES: Record<string, string> = {
  claude:     MODELS.CLAUDE,
  gpt:        "openai/gpt-4o",
  chatgpt:    "openai/gpt-4o",
  copilot:    "openai/gpt-4o-mini",
  deepseek:   "deepseek/deepseek-chat-v3-0324",
  perplexity: MODELS.SEARCH,
  gemini:     MODELS.DEFAULT,
  gemini_pro: MODELS.GEMINI_PRO,
  r1:         MODELS.DEEP,
};

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string };
      }>;
}

export interface ORResult {
  content: string;
  reasoning?: string;
}

/** Pick a random key from the pool */
function pickKey(): string {
  return OPENROUTER_KEYS[Math.floor(Math.random() * OPENROUTER_KEYS.length)]!;
}

export async function callOR(
  model: string,
  messages: ORMessage[],
  extra: Record<string, unknown> = {},
): Promise<ORResult> {
  // Shuffle keys for load balancing
  const keys = [...OPENROUTER_KEYS].sort(() => Math.random() - 0.5);
  const errors: string[] = [];

  for (const key of keys) {
    try {
      const res = await fetch(OPENROUTER_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://t.me/AI_HELIXBoT",
          "X-Title": "Helix AI Bot",
        },
        body: JSON.stringify({ model, messages, max_tokens: 8192, ...extra }),
        signal: AbortSignal.timeout(55000),
      });

      if (res.status === 401) { errors.push("401-invalid"); continue; }
      if (res.status === 402) { errors.push("402-quota"); continue; }
      if (res.status === 429) { await new Promise(r => setTimeout(r, 800)); errors.push("429-rate"); continue; }
      if (res.status >= 500)  { errors.push(`${res.status}-server`); continue; }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        errors.push(`${res.status}:${txt.slice(0, 80)}`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string | unknown[]; reasoning?: string; reasoning_content?: string };
        }>;
        error?: { message: string };
      };

      if (data.error) { errors.push(data.error.message.slice(0, 60)); continue; }

      const msg = data.choices?.[0]?.message;
      if (!msg) { errors.push("empty"); continue; }

      const raw = msg.content ?? "";
      const content = typeof raw === "string" ? raw : JSON.stringify(raw);

      return {
        content,
        reasoning: msg.reasoning ?? (msg as { reasoning_content?: string }).reasoning_content ?? "",
      };
    } catch (e: unknown) {
      const m = String((e as { message?: string })?.message ?? e);
      errors.push(m.includes("abort") || m.includes("timeout") ? "timeout" : m.slice(0, 50));
    }
  }

  throw new Error(`All ${keys.length} OpenRouter keys failed: ${[...new Set(errors)].slice(0, 4).join(" | ")}`);
}

export async function callORImage(model: string, prompt: string): Promise<Buffer | null> {
  const keys = [...OPENROUTER_KEYS].sort(() => Math.random() - 0.5);

  for (const key of keys) {
    try {
      const res = await fetch(OPENROUTER_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://t.me/AI_HELIXBoT",
          "X-Title": "Helix AI Bot",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: `Generate a high quality, detailed image: ${prompt}` }],
          modalities: ["image", "text"],
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string | Array<{ type: string; image_url?: { url: string } }> };
        }>;
      };

      const c = data.choices?.[0]?.message?.content;
      if (typeof c === "string") {
        const m = c.match(/data:image\/\w+;base64,([^"'\s]+)/);
        if (m?.[1]) return Buffer.from(m[1], "base64");
      } else if (Array.isArray(c)) {
        for (const part of c) {
          if (typeof part === "object" && part.type === "image_url" && part.image_url?.url) {
            const url = part.image_url.url;
            if (url.startsWith("data:")) {
              const b64 = url.split(",")[1];
              if (b64) return Buffer.from(b64, "base64");
            }
            const ir = await fetch(url).catch(() => null);
            if (ir?.ok) return Buffer.from(await ir.arrayBuffer());
          }
        }
      }
    } catch { continue; }
  }
  return null;
}

void pickKey;
