// Node outputs: AetioMed emits one OTel log record per finished node
// (`event.name=aetiomed.node.output`, see AetioMed `src/observability/otel.ts`).
// Loki keeps the attributes as structured metadata, dots → underscores.
// `/loki` is proxied to the lgtm container by vite.config.ts.

export type NodeOutput = {
  nodeId: string;
  time: Date;
  output: unknown;
  /** Server capped the payload: `output` is `{ truncated, bytes, preview }`. */
  truncated: boolean;
  bytes: number;
  traceId?: string;
};

type LokiStream = {
  stream: Record<string, string>;
  values: [string, string][];
};

export async function fetchNodeOutputs(
  jobId: string,
  since: Date
): Promise<NodeOutput[]> {
  const params = new URLSearchParams({
    query: `{service_name="aetiomed"} | aetiomed_job_id="${jobId}"`,
    start: `${since.getTime() - 60_000}000000`,
    limit: "5000",
    direction: "forward",
  });
  const res = await fetch(`/loki/api/v1/query_range?${params}`);
  if (!res.ok) throw new Error(`Loki: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data: { result: LokiStream[] } };

  return body.data.result
    .flatMap(({ stream, values }) =>
      values.map(([ns, line]) => ({
        nodeId: stream.aetiomed_node_id ?? "?",
        time: new Date(Number(ns.slice(0, -6))),
        output: parseJson(line),
        truncated: stream.aetiomed_node_output_truncated === "true",
        bytes: Number(stream.aetiomed_node_output_bytes ?? 0),
        traceId: stream.trace_id,
      }))
    )
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return line;
  }
}
