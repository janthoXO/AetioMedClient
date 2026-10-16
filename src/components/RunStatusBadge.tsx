import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { RunStatus } from "@/lib/db";

const VARIANT = {
  queued: "outline",
  running: "secondary",
  planned: "outline",
  done: "default",
  failed: "destructive",
  cancelled: "outline",
} as const;

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={VARIANT[status]}>
      {(status === "running" || status === "queued") && (
        <Spinner data-icon="inline-start" />
      )}
      {status}
    </Badge>
  );
}
