import { asLlm, llmModel, type LlmId } from "./llm";

type LlmOptions = {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  llm?: LlmId;
};

async function chat(
  model: string,
  apiKey: string,
  options: LlmOptions,
  timeoutMs: number,
): Promise<string | null> {
  const payload = {
    model,
    temperature: options.temperature ?? 0.22,
    max_tokens: options.maxTokens ?? 900,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
    ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
  };
  const run = async (): Promise<string | null> => {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    return text.trim() || null;
  };
  try {
    return await run();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    try {
      return await run();
    } catch {
      return null;
    }
  }
}

export async function completeGrok(options: LlmOptions): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const id = asLlm(options.llm);
  const text = await chat(llmModel(id), apiKey, options, 20_000);
  if (text) return text;
  if (id !== "grok45") return chat("grok-4.5", apiKey, options, 18_000);
  return null;
}
