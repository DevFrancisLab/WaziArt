import { describe, expect, it } from "vitest";
import { buildGraph } from "../graph";
import type { GraphEdge } from "../types";

const edges: GraphEdge[] = [
  {
    expr: "(edge paths-to-peace has-theme peace)",
    subject: "paths-to-peace",
    relation: "has-theme",
    object: "peace",
    summary: "paths-to-peace has theme peace.",
  },
  {
    expr: "(edge theme-alignment evaluated-by rule-theme-support)",
    subject: "theme-alignment",
    relation: "evaluated-by",
    object: "rule-theme-support",
    summary: "theme-alignment evaluated by rule-theme-support.",
  },
  {
    expr: "(edge rule-recommendation derives request_information)",
    subject: "rule-recommendation",
    relation: "derives",
    object: "request_information",
    summary: "rule-recommendation derives request_information.",
  },
];

describe("buildGraph", () => {
  it("uses only endpoints that appear on returned edges", () => {
    const graph = buildGraph(edges);
    const ids = graph.nodes.map((node) => node.id).sort();
    expect(ids).toEqual([
      "paths-to-peace",
      "peace",
      "request_information",
      "rule-recommendation",
      "rule-theme-support",
      "theme-alignment",
    ]);
    expect(graph.links).toHaveLength(3);
    const criterion = graph.nodes.find((node) => node.id === "theme-alignment");
    expect(criterion?.exhibition).toBe(true);
    expect(criterion?.kind).toBe("criterion");
    const recommendation = graph.nodes.find((node) => node.id === "request_information");
    expect(recommendation?.kind).toBe("recommendation");
  });

  it("returns an empty drawing when the API returns no edges", () => {
    expect(buildGraph([])).toEqual({ nodes: [], links: [] });
  });
});
