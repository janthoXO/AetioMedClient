// Self-check, no test framework: `node src/lib/graph.check.ts`
import assert from "node:assert/strict";
import { fitView, nodeIdOf, toMermaid, zoomAt } from "./graph.ts";

const graph = {
  nodes: [
    { id: "plan_phase:basis_resolve", labelKey: 'Say "hi"' },
    { id: "plan_phase:outline_phase:outline_evaluate" },
    { id: "top" },
  ],
  edges: [
    { source: "plan_phase:basis_resolve", target: "top" },
    { source: "gone", target: "top" },
  ],
};

const code = toMermaid(graph, { top: "running" });
assert.match(code, /subgraph g0\["plan_phase"\]\n {4}n0\[/);
assert.match(code, / {4}subgraph g1\["outline_phase"\]\n {6}n1\[/);
assert.match(code, /#quot;hi#quot;/);
assert.match(code, /n0 --> n2/);
assert.doesNotMatch(code, /gone/);
assert.match(code, /class n2 running/);
assert.match(code, /g0 ~~~ n2/);
assert.equal(
  nodeIdOf(graph, "n1"),
  "plan_phase:outline_phase:outline_evaluate"
);

// The point under the cursor stays put; scale is clamped.
const zoomed = zoomAt({ x: 10, y: 20, k: 1 }, 2, 110, 70);
assert.deepEqual(zoomed, { x: -90, y: -30, k: 2 });
assert.equal(zoomAt({ x: 0, y: 0, k: 1 }, 100, 0, 0).k, 4);
assert.deepEqual(fitView(100, 50, 400, 300), { x: 150, y: 125, k: 1 });
assert.deepEqual(fitView(800, 100, 432, 300), { x: 16, y: 125, k: 0.5 });
console.log("graph ok");
