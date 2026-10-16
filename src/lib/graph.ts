import type { GraphStructure } from "./types.ts";

export type NodeState = "running" | "done" | "failed";

type Group = { nodes: string[]; groups: Map<string, Group> };

const escape = (text: string) => text.replace(/"/g, "#quot;");

/**
 * Mermaid flowchart of the server graph. Node ids are `:`-qualified
 * (`plan_phase:outline_phase:outline_evaluate`); each prefix becomes a
 * nested subgraph. Mermaid ids are `n<index>` into `graph.nodes`.
 */
export function toMermaid(
  graph: GraphStructure,
  states: Record<string, NodeState> = {}
): string {
  const index = new Map(graph.nodes.map((n, i) => [n.id, `n${i}`]));
  const root: Group = { nodes: [], groups: new Map() };
  for (const node of graph.nodes) {
    let group = root;
    for (const part of node.id.split(":").slice(0, -1)) {
      if (!group.groups.has(part))
        group.groups.set(part, { nodes: [], groups: new Map() });
      group = group.groups.get(part)!;
    }
    group.nodes.push(node.id);
  }

  const lines = ["flowchart TD"];
  let groupCount = 0;
  const topIds = new Map<string, string>(); // top-level node/group → mermaid id
  const emit = (group: Group, depth: number) => {
    const pad = "  ".repeat(depth);
    for (const id of group.nodes) {
      const node = graph.nodes.find((n) => n.id === id)!;
      const leaf = id.split(":").at(-1)!;
      const label = node.labelKey
        ? `<b>${leaf}</b><br/><small>${node.labelKey}</small>`
        : `<b>${leaf}</b>`;
      lines.push(`${pad}${index.get(id)}["${escape(label)}"]`);
      if (depth === 1) topIds.set(id, index.get(id)!);
    }
    for (const [name, child] of group.groups) {
      const gid = `g${groupCount++}`;
      if (depth === 1) topIds.set(name, gid);
      lines.push(`${pad}subgraph ${gid}["${escape(name)}"]`);
      emit(child, depth + 1);
      lines.push(`${pad}end`);
    }
  };
  emit(root, 1);

  for (const { source, target } of graph.edges) {
    const s = index.get(source);
    const t = index.get(target);
    if (s && t) lines.push(`  ${s} --> ${t}`);
  }
  // Phases share no edges (their entry/exit nodes are synthetic, dropped by
  // the server), so mermaid would lay them side by side: chain them
  // invisibly in run order (= node order).
  const order = [...new Set(graph.nodes.map((n) => n.id.split(":")[0]!))];
  for (let i = 1; i < order.length; i++)
    lines.push(`  ${topIds.get(order[i - 1]!)} ~~~ ${topIds.get(order[i]!)}`);
  for (const [id, state] of Object.entries(states)) {
    const n = index.get(id);
    if (n) lines.push(`  class ${n} ${state}`);
  }
  return lines.join("\n");
}

/** Mermaid id (`n3`) back to the server node id. */
export function nodeIdOf(graph: GraphStructure, mermaidId: string) {
  return graph.nodes[Number(mermaidId.slice(1))]?.id;
}

/** Pan/zoom transform of the diagram: translate(x, y) scale(k). */
export type View = { x: number; y: number; k: number };

const clampScale = (k: number) => Math.min(4, Math.max(0.1, k));

/** Scales by `factor` while keeping viewport point (px, py) in place. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = clampScale(v.k * factor);
  const r = k / v.k;
  return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}

/** Centres content (w×h) in the viewport (vw×vh), shrunk to fit, never enlarged. */
export function fitView(
  w: number,
  h: number,
  vw: number,
  vh: number,
  pad = 16
): View {
  const k = clampScale(Math.min(1, (vw - 2 * pad) / w, (vh - 2 * pad) / h));
  return { k, x: (vw - w * k) / 2, y: (vh - h * k) / 2 };
}
