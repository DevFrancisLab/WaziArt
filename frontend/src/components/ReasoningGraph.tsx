import { useState } from "react";
import { buildGraph, kindLabel, type GraphNode, type NodeKind } from "../graph";
import type { GraphEdge } from "../types";

interface ReasoningGraphProps {
  edges: GraphEdge[];
  error?: string;
}

const COLUMN_WIDTH = 190;
const ROW_HEIGHT = 92;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 58;

/** Node-link drawing of the edges returned for this review, plus the same rows as text. */
export function ReasoningGraph({ edges, error }: ReasoningGraphProps) {
  const [highlightExhibition, setHighlightExhibition] = useState(false);
  if (error) {
    return (
      <section aria-labelledby="graph-heading">
        <h3 id="graph-heading">Reasoning relationships</h3>
        <p className="alert" role="alert">
          {error}
        </p>
      </section>
    );
  }
  if (edges.length === 0) {
    return (
      <section aria-labelledby="graph-heading">
        <h3 id="graph-heading">Reasoning relationships</h3>
        <p>No reasoning relationships were returned for this review.</p>
      </section>
    );
  }

  const graph = buildGraph(edges);
  const columns = graph.nodes.reduce((max, node) => Math.max(max, node.column), 0) + 1;
  const rows = graph.nodes.reduce((max, node) => Math.max(max, node.row), 0) + 1;
  const width = columns * COLUMN_WIDTH + 24;
  const height = Math.max(rows, 1) * ROW_HEIGHT + 16;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <section aria-labelledby="graph-heading">
      <h3 id="graph-heading">Reasoning relationships</h3>
      <p className="hint">
        Relationships named evaluated-by are exhibition criteria from the shared rules. Every other relationship was
        returned for this submission. Shape and the small label identify the kind of node. Color repeats that label.
      </p>
      <div className="graph-controls">
        <button
          type="button"
          aria-pressed={highlightExhibition}
          onClick={() => setHighlightExhibition((current) => !current)}
        >
          Highlight exhibition criteria
        </button>
      </div>
      <ul className="legend">
        <li><span className="swatch kind-artwork" /> Circle: artwork</li>
        <li><span className="swatch kind-evidence" /> Rounded: evidence or value</li>
        <li><span className="swatch kind-criterion" /> Diamond: exhibition criterion</li>
        <li><span className="swatch kind-rule" /> Rectangle: rule</li>
        <li><span className="swatch kind-recommendation" /> Pill: recommendation</li>
        <li><span className="swatch kind-challenge" /> Dashed: challenge or revision</li>
      </ul>
      <div className="graph-scroll">
        <svg
          className="graph"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby="graph-heading"
        >
          <title>Relationships returned for this review</title>
          {graph.links.map((link) => {
            const source = byId.get(link.source);
            const target = byId.get(link.target);
            if (!source || !target) return null;
            const from = center(source);
            const to = center(target);
            const faded = highlightExhibition && !link.exhibition;
            return (
              <g key={link.id} opacity={faded ? 0.35 : 1}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={link.exhibition ? "edge exhibition" : "edge"}
                />
                <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} className="edge-label">
                  {link.relation}
                </text>
              </g>
            );
          })}
          {graph.nodes.map((node) => (
            <NodeShape key={node.id} node={node} faded={highlightExhibition && !node.exhibition} />
          ))}
        </svg>
      </div>
      <div className="table-wrap">
        <table>
          <caption>The same relationships as text. This table is the keyboard-accessible view.</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">Relationship</th>
              <th scope="col">To</th>
              <th scope="col">Scope</th>
              <th scope="col">MeTTa</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((edge, index) => (
              <tr key={`${edge.expr}-${index}`}>
                <td>{edge.subject}</td>
                <td>{edge.relation}</td>
                <td>{edge.object}</td>
                <td>{edge.relation === "evaluated-by" ? "Exhibition criterion" : "This review"}</td>
                <td className="expr">{edge.expr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function center(node: GraphNode): { x: number; y: number } {
  return {
    x: 20 + node.column * COLUMN_WIDTH + NODE_WIDTH / 2,
    y: 16 + node.row * ROW_HEIGHT + NODE_HEIGHT / 2,
  };
}

function NodeShape({ node, faded }: { node: GraphNode; faded: boolean }) {
  const x = 20 + node.column * COLUMN_WIDTH;
  const y = 16 + node.row * ROW_HEIGHT;
  const label = node.id.length > 22 ? `${node.id.slice(0, 20)}…` : node.id;
  return (
    <g className={`node kind-${node.kind}`} opacity={faded ? 0.4 : 1}>
      <title>{`${kindLabel(node.kind)}: ${node.id}${node.exhibition ? " (exhibition)" : ""}`}</title>
      <Shape kind={node.kind} x={x} y={y} />
      <text x={x + NODE_WIDTH / 2} y={y + 22} textAnchor="middle" className="node-kind">
        {kindLabel(node.kind)}
      </text>
      <text x={x + NODE_WIDTH / 2} y={y + 40} textAnchor="middle" className="node-label">
        {label}
      </text>
    </g>
  );
}

function Shape({ kind, x, y }: { kind: NodeKind; x: number; y: number }) {
  if (kind === "artwork") {
    return <ellipse cx={x + NODE_WIDTH / 2} cy={y + NODE_HEIGHT / 2} rx={NODE_WIDTH / 2} ry={NODE_HEIGHT / 2} />;
  }
  if (kind === "criterion") {
    const cx = x + NODE_WIDTH / 2;
    const cy = y + NODE_HEIGHT / 2;
    return <polygon points={`${cx},${y} ${x + NODE_WIDTH},${cy} ${cx},${y + NODE_HEIGHT} ${x},${cy}`} />;
  }
  if (kind === "recommendation") {
    return <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={NODE_HEIGHT / 2} />;
  }
  if (kind === "evidence" || kind === "value") {
    return <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={12} />;
  }
  return <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={2} />;
}
