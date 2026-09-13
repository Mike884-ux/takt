export const LLM_MODELS = [
  { id: "grok46", label: "Takt", model: "grok-4.6" },
  { id: "grok45", label: "Takt", model: "grok-4.5" },
] as const;

export type LlmId = (typeof LLM_MODELS)[number]["id"];

export function asLlm(value?: string | null): LlmId {
  if (value === "grok45") return "grok45";
  return "grok46";
}

export function llmLabel(id: LlmId) {
  return "Takt";
}

export function llmModel(id: LlmId) {
  return LLM_MODELS.find((item) => item.id === id)?.model ?? "grok-4.6";
}