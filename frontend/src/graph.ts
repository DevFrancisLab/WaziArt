import type { GraphEdge } from "./types";

/**
 * Layout for edges the API already returned.
 * A node exists only when it is the subject or object of one of those edges.
 * Column choice is a reading of the relation name so the drawing can be scanned.
 * It does not add relationships.
 */
export type NodeKind =
  | "artwork"
  | "evidence"
  | "concept"
  | "criterion"
  | "rule"
  | "recommendation"
  | "challenge"
  | "revision"
  | "value";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  exhibition: boolean;
  column: number;
  row: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  relation: string;
  summary: string;
  exhibition: boolean;
}

export interface LaidOutGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

const KIND_LABEL: Record<NodeKind, string> = {
  artwork: "Artwork",
  evidence: "Evidence",
  concept: "Concept",
  criterion: "Criterion",
  rule: "Rule",
  recommendation: "Recommendation",
  challenge: "Challenge",
  revision: "Revision",
  value: "Value",
};

export function kindLabel(kind: NodeKind): string {
  return KIND_LABEL[kind];
}

export function buildGraph(edges: GraphEdge[]): LaidOutGraph {
  const ids = new Set<string>();
  edges.forEach((edge) => {
    if (edge.subject) ids.add(edge.subject);
    if (edge.object) ids.add(edge.object);
  });

  const draft = [...ids].map((id) => {
    const described = describe(id, edges);
    return { id, ...described, row: 0 };
  });
  draft.sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));

  const rows = new Map<number, number>();
  const nodes = draft.map((node) => {
    const row = rows.get(node.column) ?? 0;
    rows.set(node.column, row + 1);
    return { ...node, row };
  });

  const links = edges
    .filter((edge) => edge.subject && edge.object)
    .map((edge, index) => ({
      id: `${edge.subject}|${edge.relation}|${edge.object}|${index}`,
      source: edge.subject,
      target: edge.object,
      relation: edge.relation,
      summary: edge.summary,
      exhibition: edge.relation === "evaluated-by",
    }));

  return { nodes, links };
}

function describe(id: string, edges: GraphEdge[]): { kind: NodeKind; exhibition: boolean; column: number } {
  const asSubject = edges.filter((edge) => edge.subject === id);
  const asObject = edges.filter((edge) => edge.object === id);
  const subjectRelations = new Set(asSubject.map((edge) => edge.relation));
  const objectRelations = new Set(asObject.map((edge) => edge.relation));

  if (objectRelations.has("derives")) {
    return { kind: "recommendation", exhibition: false, column: 5 };
  }
  if (subjectRelations.has("evaluated-by") || objectRelations.has("supports")) {
    return { kind: "criterion", exhibition: true, column: 3 };
  }
  if (objectRelations.has("evaluated-by") || subjectRelations.has("derives")) {
    return {
      kind: "rule",
      exhibition: objectRelations.has("evaluated-by"),
      column: 4,
    };
  }
  if (subjectRelations.has("supports") || objectRelations.has("concept")) {
    return { kind: "concept", exhibition: false, column: 2 };
  }
  if (subjectRelations.has("concept") || objectRelations.has("has-evidence")) {
    return { kind: "evidence", exhibition: false, column: 1 };
  }
  if (objectRelations.has("has-permission") || objectRelations.has("has-theme")) {
    return { kind: "value", exhibition: false, column: 1 };
  }
  if (subjectRelations.has("corrects") || subjectRelations.has("disputes")) {
    return { kind: "challenge", exhibition: false, column: 1 };
  }
  if (subjectRelations.has("changes")) {
    return { kind: "revision", exhibition: false, column: 2 };
  }
  if ([...subjectRelations].some((relation) => relation.startsWith("has-"))) {
    return { kind: "artwork", exhibition: false, column: 0 };
  }
  return { kind: "value", exhibition: false, column: 2 };
}
