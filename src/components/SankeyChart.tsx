import { sankey, sankeyLinkHorizontal } from "d3-sankey";

type Edge = { source: string; target: string; value: number };
type NodeDatum = { id: string };

const WIDTH = 640;
const HEIGHT = 320;

// Real flow chart (not just per-stage counts) — edges are actual consecutive status
// transitions per job (see getStatusTransitions), laid out with d3-sankey's node-position
// solver rather than hand-rolled column math, since a generic transition graph (jobs can skip
// or revisit stages) isn't the fixed linear topology a hand-rolled layout could assume.
export function SankeyChart({ edges }: { edges: Edge[] }) {
  if (edges.length === 0) {
    return <p className="text-sm text-foreground-muted">Not enough status changes yet to chart a flow.</p>;
  }

  const nodeIds = Array.from(new Set(edges.flatMap((e) => [e.source, e.target])));
  const graph = sankey<NodeDatum, object>()
    .nodeId((d) => d.id)
    .nodeWidth(14)
    .nodePadding(18)
    .extent([
      [1, 1],
      [WIDTH - 1, HEIGHT - 1],
    ])({
    nodes: nodeIds.map((id) => ({ id })),
    links: edges.map((e) => ({ source: e.source, target: e.target, value: e.value })),
  });

  const linkPath = sankeyLinkHorizontal();

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Status flow">
      {graph.links.map((link, i) => (
        <path
          key={i}
          d={linkPath(link) ?? undefined}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.35}
          strokeWidth={Math.max(1, link.width ?? 0)}
        />
      ))}
      {graph.nodes.map((node) => {
        const x0 = node.x0 ?? 0;
        const x1 = node.x1 ?? 0;
        const y0 = node.y0 ?? 0;
        const y1 = node.y1 ?? 0;
        const onLeft = x0 < WIDTH / 2;
        return (
          <g key={node.id}>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--pop)" />
            <text
              x={onLeft ? x1 + 6 : x0 - 6}
              y={(y0 + y1) / 2}
              dy="0.35em"
              textAnchor={onLeft ? "start" : "end"}
              className="fill-foreground text-[11px]"
            >
              {node.id.replace("_", " ")} ({node.value})
            </text>
          </g>
        );
      })}
    </svg>
  );
}
