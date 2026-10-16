import type { LLMConfig, LLMProvider } from "@/lib/types";

// Debug client: per-provider URL/API key live in localStorage, never in runs.
export type ProviderSettings = { url?: string; apiKey?: string };
export type LlmSettings = Partial<Record<LLMProvider, ProviderSettings>>;

const KEY = "llmSettings";

export function getLlmSettings(): LlmSettings {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as LlmSettings;
  } catch {
    return {};
  }
}

export function setLlmSettings(settings: LlmSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function withCredentials(llm: {
  provider: LLMProvider;
  model: string;
}): LLMConfig {
  const { url, apiKey } = getLlmSettings()[llm.provider] ?? {};
  return {
    ...llm,
    ...(url ? { url } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}
