// AetioMed over NATS. Subject layout: AetioMed `src/transports/nats/subjects.ts`.
import { wsconnect, type NatsConnection } from "@nats-io/nats-core";
import { jetstream, jetstreamManager } from "@nats-io/jetstream";
import type { GenerationRequest, LLMConfig } from "@/lib/types";

let connection: Promise<NatsConnection> | undefined;

export function nats(): Promise<NatsConnection> {
  connection ??= wsconnect({
    servers: import.meta.env.VITE_NATS_URL ?? "ws://localhost:8080",
    user: import.meta.env.VITE_NATS_USER,
    pass: import.meta.env.VITE_NATS_PASSWORD,
  }).catch((error) => {
    connection = undefined; // next call retries
    throw error;
  });
  return connection;
}

/** Request/reply with an empty body (meta service, status, cancel). */
export async function ask<T>(subject: string, timeout = 5000): Promise<T> {
  const msg = await (await nats()).request(subject, "", { timeout });
  return msg.json<T>();
}

export async function submitJob(
  jobId: string,
  request: GenerationRequest,
  llmConfig?: LLMConfig
): Promise<void> {
  const js = jetstream(await nats());
  await js.publish(
    "cases.request.generate",
    JSON.stringify({ ...request, jobId, llmConfig }),
    { msgID: jobId }
  );
}

/** Live progress (`accepted` | `label` | `complete`). Returns unsubscribe. */
export async function watchJob(
  jobId: string,
  onEvent: (type: string, data: unknown) => void
): Promise<() => void> {
  const sub = (await nats()).subscribe(`cases.progress.${jobId}.>`, {
    callback: (error, msg) => {
      if (!error) onEvent(msg.subject.split(".").at(-1)!, msg.json());
    },
  });
  return () => sub.unsubscribe();
}

/**
 * Last message on `subject`: the server's 1 h stream first, then the
 * no-expiry mirror from `nats/init.sh`. null = not published (yet).
 */
export async function storedMessage<T>(
  kind: "result" | "plan",
  jobId: string
): Promise<T | null> {
  const jsm = await jetstreamManager(await nats());
  const streams =
    kind === "result"
      ? ["CASE_RESULTS", "CASE_ARCHIVE"]
      : ["CASE_PLANS", "PLAN_ARCHIVE"];
  for (const stream of streams) {
    const msg = await jsm.streams
      .getMessage(stream, { last_by_subj: `cases.${kind}.${jobId}` })
      .catch(() => null); // missing stream (no mirror set up) = not found
    if (msg) return msg.json<T>();
  }
  return null;
}
