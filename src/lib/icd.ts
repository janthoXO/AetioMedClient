// Diagnosis search against the WHO ICD-11 API container (the one AetioMed
// resolves `icd` codes with). `/icd` is proxied to it by vite.config.ts.

const RELEASE = import.meta.env.VITE_ICD_RELEASE ?? "2026-01";

// AetioMed's ICDCodeSchema: stem codes only (no extension codes, no clusters).
const STEM_CODE = /^[0-9A-Z][A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,2})?$/;

export type IcdEntity = { code: string; title: string };

type SearchResponse = {
  destinationEntities: { theCode?: string; title: string }[];
};

/** Titles come back in `language` (ISO 639-1), as AetioMed expects the diagnosis name. */
export async function searchIcd(
  q: string,
  language: string,
  signal: AbortSignal
): Promise<IcdEntity[]> {
  const params = new URLSearchParams({
    // Trailing % makes the last word a prefix: "diab%" finds "Diabetes".
    q: q.endsWith("%") ? q : `${q}%`,
    flatResults: "true",
    highlightingEnabled: "false",
  });
  const res = await fetch(`/icd/release/11/${RELEASE}/mms/search?${params}`, {
    headers: {
      "API-Version": "v2",
      Accept: "application/json",
      "Accept-Language": language,
    },
    signal,
  });
  if (!res.ok) throw new Error(`ICD search failed: HTTP ${res.status}`);
  const { destinationEntities } = (await res.json()) as SearchResponse;
  return destinationEntities
    .filter((e) => e.theCode && STEM_CODE.test(e.theCode))
    .map((e) => ({ code: e.theCode!, title: e.title }));
}
