import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Plus } from "lucide-react";
import { CaseView } from "@/components/CaseView";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAllowedLlms } from "@/hooks/useMeta";
import { FLAG_LABELS } from "@/lib/types";
import { db, type RunRecord } from "@/lib/db";
import { startRun } from "@/lib/jobs";

const llmLabel = (llm: RunRecord["llm"]) =>
  llm ? `${llm.provider} · ${llm.model}` : "server default";

function duration(run: RunRecord) {
  if (!run.finishedAt) return "-";
  const s = Math.round((+run.finishedAt - +run.createdAt) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function AddRunDialog({
  caseId,
  request,
  open,
  onOpenChange,
}: {
  caseId: number;
  request: RunRecord["request"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data: allowed } = useAllowedLlms();
  const [choice, setChoice] = useState<string | null>(null);

  const options = Object.entries(allowed ?? {}).flatMap(([provider, models]) =>
    (models ?? []).map((model) => ({
      value: `${provider}/${model}`,
      label: `${provider} · ${model}`,
    }))
  );
  const selected = choice ?? options[0]?.value ?? "default";
  const items = options.length
    ? options
    : [{ value: "default", label: "Server default" }];

  async function submit() {
    const option = options.find((o) => o.value === selected);
    const llm = option && {
      provider: option.value.split("/")[0] as NonNullable<
        RunRecord["llm"]
      >["provider"],
      model: option.value.slice(option.value.indexOf("/") + 1),
    };
    const jobId = await startRun(caseId, request, llm);
    onOpenChange(false);
    navigate(`/cases/${caseId}/runs/${jobId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add run</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>LLM</FieldLabel>
            <Select
              items={items}
              value={selected}
              onValueChange={(v) => setChoice(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => void submit()}>Start run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CasePage() {
  const { caseId: param } = useParams();
  const caseId = Number(param);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const kase = useLiveQuery(
    async () => (await db.cases.get(caseId)) ?? null,
    [caseId]
  );
  const runs = useLiveQuery(
    () => db.runs.where({ caseId }).sortBy("createdAt"),
    [caseId]
  );

  if (kase === undefined) return <Skeleton className="h-32 w-full" />;
  if (kase === null)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Case not found</EmptyTitle>
          <EmptyDescription>
            <Link to="/">Back to start</Link>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const { request } = kase;
  const instructions = Object.entries(request.userInstructions ?? {});
  const done = (runs ?? []).filter((r) => r.status === "done" && r.result);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-medium">
            {request.diagnosis}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {request.language && (
              <Badge variant="outline">{request.language}</Badge>
            )}
            {request.difficulty && (
              <Badge variant="outline">{request.difficulty}</Badge>
            )}
            <Badge variant="secondary">{request.mode ?? "normal"}</Badge>
            {request.generationFlags.map((flag) => (
              <Badge key={flag} variant="outline">
                {FLAG_LABELS[flag]}
              </Badge>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            Created {kase.createdAt.toLocaleString()}
          </span>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add run
        </Button>
      </div>

      {instructions.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
            User instructions
            <ChevronDown data-icon="inline-end" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {instructions.map(([key, text]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="whitespace-pre-wrap">{text}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-medium">Runs</h2>
        {runs?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LLM</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow
                  key={run.jobId}
                  className="cursor-pointer"
                  onClick={() => navigate(`/cases/${caseId}/runs/${run.jobId}`)}
                >
                  <TableCell>{llmLabel(run.llm)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {run.request.mode ?? "normal"}
                      {run.fromPlanOf && (
                        <Link
                          to={`/cases/${caseId}/runs/${run.fromPlanOf}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs underline underline-offset-4"
                        >
                          from plan
                        </Link>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.status === "running" ? run.labels.at(-1)?.label : null}
                  </TableCell>
                  <TableCell>{duration(run)}</TableCell>
                  <TableCell>{run.createdAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No runs yet</EmptyTitle>
              <EmptyDescription>
                Add a run to generate this case.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      {done.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="font-heading text-base font-medium">Compare</h2>
          <div className="flex items-start gap-4 overflow-x-auto pb-2">
            {done.map((run) => (
              <Card key={run.jobId} className="w-[28rem] shrink-0">
                <CardHeader>
                  <CardTitle>{llmLabel(run.llm)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CaseView result={run.result!} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <AddRunDialog
        caseId={caseId}
        request={request}
        open={adding}
        onOpenChange={setAdding}
      />
    </div>
  );
}
