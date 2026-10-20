// Wire types, hand-copied from AetioMed `contracts/*.schema.json`.

export type GenerationFlag =
  "patient" | "chiefComplaint" | "anamnesis" | "procedures";
export const FLAG_LABELS: Record<GenerationFlag, string> = {
  patient: "Patient",
  chiefComplaint: "Chief complaint",
  anamnesis: "Anamnesis",
  procedures: "Procedures",
};
export type Difficulty = "easy" | "medium" | "hard";
export type GenerationMode = "normal" | "plan";
export type LLMProvider = "ollama" | "google" | "openai";
export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  ollama: "Ollama",
  google: "Google",
  openai: "OpenAI",
};

export type LLMConfig = {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  url?: string;
};

export type PlanSegment = { fixed: boolean; text: string };

/** CaseGenerationRequest minus `jobId` and `llmConfig`, which belong to a run. */
export type GenerationRequest = {
  diagnosis: string;
  /** ICD-11 stem code picked in the search; with ICD on, the server resolves the diagnosis from it. */
  icd?: string;
  generationFlags: GenerationFlag[];
  userInstructions?: Partial<Record<GenerationFlag | "general", string>>;
  language?: string;
  difficulty?: Difficulty;
  mode?: GenerationMode;
  plan?: PlanSegment[];
};

/** `text/*` → `value` is the text; else `value` is base64. */
export type ContentPart = { type: string; value: string; alt: string };

export type Patient = {
  name: string;
  age: number;
  height: number;
  weight: number;
  gender: "male" | "female";
};

export type Procedure = {
  name: string;
  order: number;
  relevance: "obligatory" | "optional" | "contraindicated";
  result: ContentPart[];
};

export type ProcedureCategory = {
  name: string;
  categories: ProcedureCategory[];
  procedures: Procedure[];
};

export type CaseResult = {
  jobId?: string;
  language: string;
  patient?: Patient;
  chiefComplaint?: ContentPart[];
  anamnesis?: { category: string; answer: ContentPart[] }[];
  procedures?: { categories: ProcedureCategory[]; procedures: Procedure[] };
};

export type JobError = { code: string; message: string; details?: string };

export type CaseResponse = CaseResult | { jobId?: string; error: JobError };

export type PlanPayload = {
  jobId: string;
  mode: GenerationMode;
  language: string;
  plan: PlanSegment[];
};

export type LabelEvent = {
  jobId: string;
  nodeId: string;
  status: "started" | "completed" | "failed";
  label: string;
  timestamp: string;
};

export type CompleteEvent = {
  jobId: string;
  timestamp: string;
} & (
  | { status: "done" | "planned" | "cancelled" }
  | { status: "failed"; error: { code: string; message: string } }
);

export type GraphStructure = {
  nodes: { id: string; labelKey?: string }[];
  edges: { source: string; target: string }[];
};

export type AllowedLlms = Partial<Record<LLMProvider, string[]>>;
