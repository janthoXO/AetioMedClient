import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { useGraph } from "@/hooks/useMeta";
import type { RunRecord } from "@/lib/db";
import {
  fitView,
  nodeIdOf,
  toMermaid,
  zoomAt,
  type NodeState,
  type View,
} from "@/lib/graph";
import { fetchNodeOutputs, type NodeOutput } from "@/lib/loki";
import type { GraphStructure } from "@/lib/types";

// Mermaid can't read CSS variables, so node states use fixed colours that
// read on both themes.
const STATE_COLORS: Record<NodeState, [fill: string, stroke: string]> = {
  running: ["#f59e0b", "#b45309"],
  done: ["#22c55e", "#15803d"],
  failed: ["#ef4444", "#b91c1c"],
};
const CLASS_DEFS = Object.entries(STATE_COLORS)
  .map(
    ([state, [fill, stroke]]) =>
      `classDef ${state} fill:${fill},stroke:${stroke},color:${state === "failed" ? "#fff" : "#000"}`
  )
  .join("\n");

const STATE_OF = {
  started: "running",
  completed: "done",
  failed: "failed",
} as const;

const leaf = (nodeId: string) => nodeId.split(":").at(-1)!;
const time = (d: Date) => d.toLocaleTimeString();

function useDark() {
  const root = document.documentElement;
  const [dark, setDark] = useState(root.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(root.classList.contains("dark"))
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [root]);
  return dark;
}

/** Node outputs from Loki: polled while the run is live, once more after it. */
function useNodeOutputs(run: RunRecord) {
  const [outputs, setOutputs] = useState<NodeOutput[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const live = run.status === "queued" || run.status === "running";
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchNodeOutputs(run.jobId, run.createdAt).then(
        (o) => alive && (setOutputs(o), setUnreachable(false)),
        () => alive && setUnreachable(true)
      );
    void load();
    // OTel batches records: a finished run's last outputs land a bit later.
    const timer = live ? setInterval(load, 3000) : setTimeout(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(timer);
    };
  }, [run.jobId, run.createdAt, live]);
  return { outputs, unreachable };
}

/** Wheel/pinch zooms around the pointer, dragging pans, buttons zoom around the centre. */
function PanZoom({ children }: { children: React.ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });

  const fit = useCallback(() => {
    const c = content.current!;
    const v = viewport.current!;
    if (c.offsetWidth)
      setView(
        fitView(c.offsetWidth, c.offsetHeight, v.clientWidth, v.clientHeight)
      );
  }, []);
  const zoomBy = (factor: number) => {
    const v = viewport.current!;
    setView((cur) =>
      zoomAt(cur, factor, v.clientWidth / 2, v.clientHeight / 2)
    );
  };

  // Fit once, when the diagram first gets a size; later re-renders (live
  // state colours) keep whatever view the user set.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!content.current?.offsetWidth) return;
      fit();
      observer.disconnect();
    });
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, [fit]);

  // React's onWheel is passive, so preventDefault needs a native listener.
  useEffect(() => {
    const el = viewport.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      setView((cur) =>
        zoomAt(cur, factor, e.clientX - rect.left, e.clientY - rect.top)
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="relative h-full">
      <div
        ref={viewport}
        className="h-full cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.button === 0)
            drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!(e.buttons & 1)) return void (drag.current = null);
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          // A few pixels of jitter is still a click on a node.
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
          Object.assign(d, { x: e.clientX, y: e.clientY, moved: true });
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        // The click ending a drag must not select the node under the pointer.
        onClickCapture={(e) => {
          if (drag.current?.moved) e.stopPropagation();
          drag.current = null;
        }}
      >
        <div
          ref={content}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          }}
        >
          {children}
        </div>
      </div>
      <div className="absolute top-3 left-3 flex gap-3 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-xs">
        {Object.entries(STATE_COLORS).map(([state, [fill]]) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ background: fill }}
            />
            {state}
          </span>
        ))}
      </div>
      <div className="absolute top-3 right-3 flex flex-col items-center divide-y rounded-lg border bg-background shadow-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.25)}
        >
          <Plus />
        </Button>
        <span className="w-full py-1 text-center text-[10px] text-muted-foreground tabular-nums">
          {Math.round(view.k * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => zoomBy(0.8)}
        >
          <Minus />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fit" onClick={fit}>
          <Scan />
        </Button>
      </div>
    </div>
  );
}

function Diagram({
  graph,
  states,
  selected,
  onSelect,
}: {
  graph: GraphStructure;
  states: Record<string, NodeState>;
  selected?: string;
  onSelect: (nodeId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = useDark();
  const [error, setError] = useState<string>();
  // Bumped after each render so the highlight effect runs on the new SVG.
  const [rendered, setRendered] = useState(0);
  const code = useMemo(
    () => `${toMermaid(graph, states)}\n${CLASS_DEFS}`,
    [graph, states]
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          // Natural size; the container scrolls instead of shrinking the SVG.
          flowchart: { htmlLabels: true, useMaxWidth: false },
        });
        const { svg } = await mermaid.render(
          `graph-${crypto.randomUUID()}`,
          code
        );
        if (!alive || !ref.current) return;
        ref.current.innerHTML = svg;
        for (const el of ref.current.querySelectorAll<SVGGElement>("g.node")) {
          const id = nodeIdOf(
            graph,
            /flowchart-(n\d+)-/.exec(el.id)?.[1] ?? ""
          );
          if (!id) continue;
          el.dataset.nodeId = id;
          el.style.cursor = "pointer";
          el.addEventListener("click", () => onSelect(id));
        }
        setError(undefined);
        setRendered((n) => n + 1);
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, dark, graph, onSelect]);

  useEffect(() => {
    for (const el of ref.current?.querySelectorAll<SVGGElement>("g.node") ??
      []) {
      for (const shape of el.querySelectorAll<SVGElement>("rect, polygon")) {
        if (el.dataset.nodeId === selected)
          shape.style.setProperty("stroke", "var(--primary)", "important");
        else shape.style.removeProperty("stroke");
        shape.style.strokeWidth = el.dataset.nodeId === selected ? "4px" : "";
      }
    }
  }, [selected, rendered]);

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Could not render the graph</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div ref={ref} className="w-max" />
    </>
  );
}

function OutputBlock({ output }: { output: NodeOutput }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{time(output.time)}</span>
        <span>{output.bytes} bytes</span>
        {output.truncated && (
          <Badge variant="secondary">truncated by server (50 KB cap)</Badge>
        )}
      </div>
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs wrap-break-word whitespace-pre-wrap">
        {typeof output.output === "string"
          ? output.output
          : JSON.stringify(output.output, null, 2)}
      </pre>
    </div>
  );
}

function NodePanel({
  run,
  outputs,
  selected,
  onSelect,
}: {
  run: RunRecord;
  outputs: NodeOutput[];
  selected?: string;
  onSelect: (nodeId?: string) => void;
}) {
  if (!selected) {
    return (
      <div className="flex flex-col gap-1">
        <h3 className="mb-1 text-sm font-medium">Node outputs</h3>
        {outputs.length === 0 && (
          <p className="text-sm text-muted-foreground">No outputs yet.</p>
        )}
        {outputs.map((o, i) => (
          <button
            key={i}
            type="button"
            className="flex items-center gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
            onClick={() => onSelect(o.nodeId)}
          >
            <span className="text-xs text-muted-foreground">
              {time(o.time)}
            </span>
            <span className="flex-1 font-mono">{leaf(o.nodeId)}</span>
            <span className="text-xs text-muted-foreground">{o.bytes} B</span>
          </button>
        ))}
      </div>
    );
  }
  const labels = run.labels.filter((l) => l.nodeId === selected);
  const own = outputs.filter((o) => o.nodeId === selected);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm break-all">{selected}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          onClick={() => onSelect(undefined)}
        >
          <X />
        </Button>
      </div>
      {labels.length > 0 && (
        <div className="flex flex-col gap-1 text-xs">
          {labels.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground">
                {time(new Date(l.timestamp))}
              </span>
              <Badge variant="outline">{l.status}</Badge>
              <span>{l.label}</span>
            </div>
          ))}
        </div>
      )}
      {own.length === 0 && (
        <p className="text-sm text-muted-foreground">No outputs.</p>
      )}
      {own.map((o, i) => (
        <OutputBlock key={i} output={o} />
      ))}
    </div>
  );
}

export function RunGraph({ run }: { run: RunRecord }) {
  const { data: graph, error } = useGraph();
  const { outputs, unreachable } = useNodeOutputs(run);
  const [selected, setSelected] = useState<string>();

  const states = useMemo(() => {
    // Outputs first: they also cover runs whose live labels this client missed.
    const result: Record<string, NodeState> = {};
    for (const o of outputs) result[o.nodeId] = "done";
    for (const l of run.labels) result[l.nodeId] = STATE_OF[l.status];
    return result;
  }, [run.labels, outputs]);

  if (error)
    return (
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertTitle>Could not load the graph</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!graph) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      {unreachable && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            Can't reach Loki — is the lgtm container up? Vite proxies /loki to
            localhost:3100
          </AlertTitle>
        </Alert>
      )}
      {/* The group sets an inline height: 100%, so size the wrapper. */}
      <div className="h-[70vh] rounded-lg border">
        <ResizablePanelGroup>
          <ResizablePanel defaultSize="65%" minSize="25%">
            <PanZoom>
              <Diagram
                graph={graph}
                states={states}
                selected={selected}
                onSelect={setSelected}
              />
            </PanZoom>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="35%" minSize="20%">
            <div className="h-full overflow-auto p-3">
              <NodePanel
                run={run}
                outputs={outputs}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
