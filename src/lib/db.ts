import Dexie, { type EntityTable } from "dexie";
import type {
  CaseResult,
  GenerationRequest,
  JobError,
  LabelEvent,
  LLMProvider,
  PlanPayload,
} from "@/lib/types";

/** One diagnosis + settings; its runs are the generations (one per LLM). */
export type CaseRecord = {
  id: number;
  createdAt: Date;
  request: GenerationRequest;
};

export type RunStatus =
  "queued" | "running" | "planned" | "done" | "failed" | "cancelled";

/** One job. Credentials are never stored here, only in settings. */
export type RunRecord = {
  jobId: string;
  caseId: number;
  createdAt: Date;
  /** Exactly what was sent, minus jobId/llmConfig; rerun sends it again. */
  request: GenerationRequest;
  /** Undefined = server's own LLM (no ALLOW_LLMS). */
  llm?: { provider: LLMProvider; model: string };
  /** The plan-mode run whose (edited) plan this run generates from. */
  fromPlanOf?: string;
  status: RunStatus;
  /** Live labels as received; core NATS, so only what this client saw. */
  labels: LabelEvent[];
  plan?: PlanPayload;
  result?: CaseResult;
  error?: JobError;
  finishedAt?: Date;
};

export const db = new Dexie("AetioMedClient") as Dexie & {
  cases: EntityTable<CaseRecord, "id">;
  runs: EntityTable<RunRecord, "jobId">;
};

db.version(1).stores({
  cases: "++id, createdAt",
  runs: "jobId, caseId, status",
});

export async function deleteCase(id: number): Promise<void> {
  await db.transaction("rw", db.cases, db.runs, async () => {
    await db.runs.where({ caseId: id }).delete();
    await db.cases.delete(id);
  });
}
