// Run lifecycle: submit over JetStream, follow live progress, settle from the
// stored result/plan. Everything lands in Dexie; the UI reads it live.
import { db, type RunRecord } from "@/lib/db";
import { ask, storedMessage, submitJob, watchJob } from "@/lib/nats";
import { withCredentials } from "@/lib/settings";
import type {
  CaseResponse,
  CompleteEvent,
  GenerationRequest,
  LabelEvent,
  PlanPayload,
} from "@/lib/types";

const watching = new Map<string, () => void>();

export async function startRun(
  caseId: number,
  request: GenerationRequest,
  llm?: RunRecord["llm"],
  fromPlanOf?: string
): Promise<string> {
  const jobId = crypto.randomUUID();
  await db.runs.add({
    jobId,
    caseId,
    createdAt: new Date(),
    request,
    llm,
    fromPlanOf,
    status: "queued",
    labels: [],
  });
  try {
    // Subscribe first: progress is core NATS, nothing is replayed.
    await watch(jobId);
    await submitJob(jobId, request, llm && withCredentials(llm));
  } catch (error) {
    stopWatching(jobId);
    await db.runs.update(jobId, {
      status: "failed",
      error: { code: "SUBMIT_FAILED", message: String(error) },
      finishedAt: new Date(),
    });
  }
  return jobId;
}

export function rerun(run: RunRecord): Promise<string> {
  return startRun(run.caseId, run.request, run.llm, run.fromPlanOf);
}

/** Generate the case from a plan-mode run's (edited) plan, as a new run. */
export function generateFromPlan(
  run: RunRecord,
  plan: PlanPayload["plan"]
): Promise<string> {
  return startRun(
    run.caseId,
    { ...run.request, mode: "normal", plan },
    run.llm,
    run.jobId
  );
}

/** Owner replica answers; none = job not running (queued, unknown or over). */
export async function cancelRun(jobId: string): Promise<boolean> {
  try {
    return (await ask<{ cancelled: boolean }>(`cases.cancel.${jobId}`))
      .cancelled;
  } catch {
    return false;
  }
}

/** On startup: settle what finished while the tab was closed, follow the rest. */
export async function resumeRuns(): Promise<void> {
  const open = await db.runs
    .where("status")
    .anyOf("queued", "running")
    .toArray();
  await Promise.all(
    open.map(async ({ jobId }) => {
      if (!(await settle(jobId))) await watch(jobId);
    })
  );
}

async function watch(jobId: string): Promise<void> {
  if (watching.has(jobId)) return;
  const stop = await watchJob(jobId, (type, data) => {
    if (type === "accepted") {
      void db.runs.update(jobId, { status: "running" });
    } else if (type === "label") {
      void db.runs.where({ jobId }).modify((run) => {
        run.labels.push(data as LabelEvent);
        run.status = "running";
      });
    } else if (type === "complete") {
      void complete(jobId, data as CompleteEvent);
    }
  });
  watching.set(jobId, stop);
}

function stopWatching(jobId: string): void {
  watching.get(jobId)?.();
  watching.delete(jobId);
}

async function complete(jobId: string, event: CompleteEvent): Promise<void> {
  stopWatching(jobId);
  // The result/plan may land in its stream just after `complete`: retry a bit.
  for (let i = 0; i < 20; i++) {
    if (await settle(jobId)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  await db.runs.update(jobId, {
    status: event.status === "cancelled" ? "cancelled" : "failed",
    error:
      event.status === "failed"
        ? event.error
        : { code: "NO_RESULT", message: `Job ${event.status}, nothing stored` },
    finishedAt: new Date(event.timestamp),
  });
}

/** Settle from stored messages. false = nothing final stored yet. */
async function settle(jobId: string): Promise<boolean> {
  const [response, plan] = await Promise.all([
    storedMessage<CaseResponse>("result", jobId),
    storedMessage<PlanPayload>("plan", jobId),
  ]);
  const patch: Partial<RunRecord> = { finishedAt: new Date() };
  if (plan) patch.plan = plan;

  if (response && "error" in response) {
    patch.status =
      response.error.code === "GENERATION_CANCELLED" ? "cancelled" : "failed";
    patch.error = response.error;
  } else if (response) {
    patch.status = "done";
    patch.result = response;
  } else if (plan?.mode === "plan") {
    patch.status = "planned";
  } else {
    // A normal-mode plan arrives before the case: keep it, not final.
    if (plan) await db.runs.update(jobId, { plan });
    return false;
  }
  await db.runs.update(jobId, patch);
  return true;
}
