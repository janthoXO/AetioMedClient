import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileSearch,
  RotateCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CaseView } from "@/components/CaseView";
import { PlanReviewDialog } from "@/components/PlanReviewDialog";
import { PlanView } from "@/components/PlanView";
import { RunGraph } from "@/components/RunGraph";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, type RunRecord } from "@/lib/db";
import { cancelRun, rerun } from "@/lib/jobs";
import { FLAG_LABELS, PROVIDER_LABELS, type GenerationFlag } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABEL_VARIANT = {
  started: "secondary",
  completed: "default",
  failed: "destructive",
} as const;

const defaultTab = (status: RunRecord["status"]) =>
  status === "queued" || status === "running"
    ? "graph"
    : status === "planned"
      ? "plan"
      : status === "done"
        ? "case"
        : "labels";

const FINISHED_TOAST = {
  done: { message: "Case generated", action: "Show case" },
  planned: { message: "Plan ready for review", action: "Show plan" },
  failed: { message: "Generation failed", action: "Show labels" },
  cancelled: { message: "Generation cancelled", action: "Show labels" },
} as const;

function EmptyNote({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

type StageState = "pending" | "active" | "done" | "failed";

/** One pipeline step in the tab bar: a numbered caption over its tabs. */
function Stage({
  step,
  title,
  state = "pending",
  children,
}: {
  step?: number;
  title: string;
  state?: StageState;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        {step && (
          <span
            className={cn(
              "flex size-4 items-center justify-center rounded-full border text-[10px]",
              state === "done" &&
                "border-primary bg-primary text-primary-foreground",
              state === "failed" &&
                "border-destructive bg-destructive text-white"
            )}
          >
            {state === "active" ? <Spinner className="size-3" /> : step}
          </span>
        )}
        {title}
      </span>
      <div className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px]">
        {children}
      </div>
    </div>
  );
}

function StageArrow() {
  return (
    <ChevronRight className="mb-2 size-4 shrink-0 text-muted-foreground" />
  );
}

function Count({ n }: { n: number }) {
  return n > 0 ? (
    <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
  ) : null;
}

async function copyJson(run: RunRecord) {
  await navigator.clipboard.writeText(JSON.stringify(run, null, 2));
  toast("Run JSON copied");
}

/** What was sent to the server for this run. */
function RequestView({ run }: { run: RunRecord }) {
  const { request } = run;
  const instructions = Object.entries(request.userInstructions ?? {});
  const rows: [string, React.ReactNode][] = [
    ["Diagnosis", request.diagnosis],
    ["ICD", request.icd ?? "—"],
    [
      "LLM",
      run.llm
        ? `${PROVIDER_LABELS[run.llm.provider]} · ${run.llm.model}`
        : "server default",
    ],
    ["Language", request.language ?? "—"],
    ["Difficulty", request.difficulty ?? "—"],
    ["Mode", request.mode ?? "normal"],
    [
      "Fields",
      <div className="flex flex-wrap gap-1">
        {request.generationFlags.map((flag) => (
          <Badge key={flag} variant="outline">
            {FLAG_LABELS[flag]}
          </Badge>
        ))}
      </div>,
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      {instructions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>User instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              {instructions.map(([key, text]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">
                    {key === "general"
                      ? "General"
                      : FLAG_LABELS[key as GenerationFlag]}
                  </dt>
                  <dd className="whitespace-pre-wrap">{text}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
      {request.plan && (
        <Card>
          <CardHeader>
            <CardTitle>Edited plan sent with the request</CardTitle>
          </CardHeader>
          <CardContent className="max-w-3xl">
            <PlanView plan={request.plan} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Seconds since the run was created, e.g. "+12.3s". */
const elapsed = (run: RunRecord, timestamp: string) =>
  `+${((new Date(timestamp).getTime() - run.createdAt.getTime()) / 1000).toFixed(1)}s`;

function LabelsView({ run }: { run: RunRecord }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Labels are live-only: events missed while the client was closed can't be
        recovered.
      </p>
      {run.labels.length ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Elapsed</TableHead>
                <TableHead>Node</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.labels.map((l, i) => (
                <TableRow key={i}>
                  <TableCell
                    className="text-muted-foreground tabular-nums"
                    title={new Date(l.timestamp).toLocaleTimeString()}
                  >
                    {elapsed(run, l.timestamp)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className="text-muted-foreground">
                      {l.nodeId.split(":").slice(0, -1).join(" › ")}
                      {l.nodeId.includes(":") && " › "}
                    </span>
                    {l.nodeId.split(":").at(-1)}
                  </TableCell>
                  <TableCell>{l.label}</TableCell>
                  <TableCell>
                    <Badge variant={LABEL_VARIANT[l.status]}>{l.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyNote title="No labels received" />
      )}
    </div>
  );
}

function RunDetail({ run }: { run: RunRecord }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => defaultTab(run.status));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const active = run.status === "queued" || run.status === "running";

  // Tell the viewer once the run they are watching finishes; the tab stays put.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) {
      const { message, action } =
        FINISHED_TOAST[run.status as keyof typeof FINISHED_TOAST];
      (run.status === "failed" ? toast.error : toast.success)(message, {
        duration: 10_000,
        action: {
          label: action,
          onClick: () => setTab(defaultTab(run.status)),
        },
      });
    }
    wasActive.current = active;
  }, [active, run.status]);

  async function cancel() {
    if (!(await cancelRun(run.jobId)))
      toast(
        "No replica is running this job (still queued or already finished)"
      );
  }

  async function copyId() {
    await navigator.clipboard.writeText(run.jobId);
    toast("Job id copied");
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-xl font-medium">
              {run.llm
                ? `${PROVIDER_LABELS[run.llm.provider]} · ${run.llm.model}`
                : "server default"}
            </h1>
            <RunStatusBadge status={run.status} />
          </div>
          <div className="flex items-center gap-1">
            <code className="font-mono text-xs">{run.jobId}</code>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy job id"
              onClick={() => void copyId()}
            >
              <Copy />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            Created {run.createdAt.toLocaleString()}
            {run.finishedAt && ` · finished ${run.finishedAt.toLocaleString()}`}
          </span>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              to={`/cases/${run.caseId}`}
              className="underline underline-offset-4"
            >
              Back to case
            </Link>
            {run.fromPlanOf && (
              <Link
                to={`/cases/${run.caseId}/runs/${run.fromPlanOf}`}
                className="underline underline-offset-4"
              >
                Generated from plan of run {run.fromPlanOf.slice(0, 8)}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {run.status === "planned" && run.plan && (
            <Button onClick={() => setReviewing(true)}>
              <FileSearch data-icon="inline-start" />
              Review plan
            </Button>
          )}
          {active && (
            <Button variant="outline" onClick={() => setConfirmCancel(true)}>
              <X data-icon="inline-start" />
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            onClick={async () =>
              navigate(`/cases/${run.caseId}/runs/${await rerun(run)}`)
            }
          >
            <RotateCw data-icon="inline-start" />
            Rerun
          </Button>
        </div>
      </div>

      {run.error && (
        <Alert variant="destructive">
          <AlertTitle>{run.error.code}</AlertTitle>
          <AlertDescription>
            {run.error.message}
            {run.error.details && (
              <Collapsible>
                <CollapsibleTrigger
                  render={<Button variant="ghost" size="xs" />}
                >
                  Details
                  <ChevronDown data-icon="inline-end" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="overflow-x-auto text-xs">
                    {run.error.details}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="flex-wrap items-end justify-start gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          <Stage step={1} title="Request" state="done">
            <TabsTrigger value="request">Request</TabsTrigger>
          </Stage>
          <StageArrow />
          <Stage
            step={2}
            title="Run"
            state={active ? "active" : run.labels.length ? "done" : "pending"}
          >
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="labels">
              Labels
              <Count n={run.labels.length} />
            </TabsTrigger>
          </Stage>
          <StageArrow />
          <Stage step={3} title="Plan" state={run.plan ? "done" : "pending"}>
            <TabsTrigger value="plan">Plan</TabsTrigger>
          </Stage>
          <StageArrow />
          <Stage
            step={4}
            title="Result"
            state={
              run.result
                ? "done"
                : run.status === "failed" || run.status === "cancelled"
                  ? "failed"
                  : "pending"
            }
          >
            <TabsTrigger value="case">Case</TabsTrigger>
          </Stage>
          <div className="ml-auto">
            <Stage title="Debug">
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </Stage>
          </div>
        </TabsList>
        <TabsContent value="request" className="pt-2">
          <RequestView run={run} />
        </TabsContent>
        <TabsContent value="graph" className="pt-2">
          <RunGraph run={run} />
        </TabsContent>
        <TabsContent value="labels" className="pt-2">
          <LabelsView run={run} />
        </TabsContent>
        <TabsContent value="plan" className="pt-2">
          {run.plan ? (
            <Card>
              <CardHeader>
                <CardAction className="flex gap-2">
                  <Badge variant="outline">{run.plan.mode}</Badge>
                  <Badge variant="outline">{run.plan.language}</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="max-w-3xl">
                <PlanView plan={run.plan.plan} />
              </CardContent>
            </Card>
          ) : (
            <EmptyNote
              title="No plan"
              description={
                active
                  ? "The plan appears once the plan phase finishes."
                  : undefined
              }
            />
          )}
        </TabsContent>
        <TabsContent value="case" className="pt-2">
          {run.result ? (
            <CaseView result={run.result} />
          ) : active ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <EmptyNote title="No case" description={`Run ${run.status}.`} />
          )}
        </TabsContent>
        <TabsContent value="raw" className="pt-2">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-4 z-10"
              onClick={() => void copyJson(run)}
            >
              <Copy data-icon="inline-start" />
              Copy JSON
            </Button>
            <ScrollArea className="h-[60vh] rounded-lg border bg-muted/30">
              <pre className="p-3 font-mono text-xs">
                {JSON.stringify(run, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
            <AlertDialogDescription>
              The server will stop generating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void cancel()}
            >
              Cancel run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {run.plan && (
        <PlanReviewDialog
          run={run}
          open={reviewing}
          onOpenChange={setReviewing}
        />
      )}
    </div>
  );
}

export default function RunPage() {
  const { jobId = "" } = useParams();
  const run = useLiveQuery(
    async () => (await db.runs.get(jobId)) ?? null,
    [jobId]
  );
  if (run === undefined) return <Skeleton className="h-32 w-full" />;
  if (run === null)
    return (
      <EmptyNote
        title="Run not found"
        description="It may have been deleted."
      />
    );
  // key: default tab is chosen from the status once per run
  return <RunDetail key={run.jobId} run={run} />;
}
