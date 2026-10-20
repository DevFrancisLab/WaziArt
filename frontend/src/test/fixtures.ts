import type { Review, Vocabulary } from "../types";

export const vocabulary: Vocabulary = {
  exhibition_theme: "peace",
  concepts: ["reconciliation", "dialogue", "memorial"],
  permissions: ["confirmed", "missing", "disputed"],
  recommendations: ["recommend_for_review", "request_information", "human_review"],
};

export function review(recommendation: string, label: string, extra: Partial<Review> = {}): Review {
  return {
    artwork_id: "paths-to-peace",
    recommendation,
    label,
    status_note: "Status sentence from the service.",
    disclaimer: "A recommendation is not a measure of artistic worth.",
    trace: [
      {
        expr: "(trace rule-required (missing permission))",
        rule: "rule-required",
        kind: "missing",
        summary: "Permission was not supplied, so it is not treated as confirmed.",
      },
      {
        expr: `(trace rule-recommendation (outcome ${recommendation}))`,
        rule: "rule-recommendation",
        kind: "recommendation",
        summary: `The rules infer the recommendation ${recommendation}.`,
      },
    ],
    edges: [
      {
        expr: "(edge paths-to-peace has-evidence evidence-1)",
        subject: "paths-to-peace",
        relation: "has-evidence",
        object: "evidence-1",
        summary: "paths-to-peace has evidence evidence-1.",
      },
      {
        expr: "(edge theme-alignment evaluated-by rule-theme-support)",
        subject: "theme-alignment",
        relation: "evaluated-by",
        object: "rule-theme-support",
        summary: "theme-alignment evaluated by rule-theme-support.",
      },
      {
        expr: `(edge rule-recommendation derives ${recommendation})`,
        subject: "rule-recommendation",
        relation: "derives",
        object: recommendation,
        summary: `rule-recommendation derives ${recommendation}.`,
      },
    ],
    records: [
      { fact_id: "fact-1", role: "title", value: "Paths to Peace" },
      { fact_id: "fact-2", role: "description", value: "Figures meet beside a paper river." },
      { fact_id: "fact-3", role: "evidence", evidence_id: "evidence-1", value: "reconciliation" },
    ],
    history: [
      { fact_id: "fact-1", role: "title", value: "Paths to Peace", status: "current" },
      { fact_id: "fact-4", role: "permission", value: "missing", status: "superseded" },
      { fact_id: "fact-5", role: "permission", value: "confirmed", status: "current" },
    ],
    revisions: [],
    challenges: [],
    ...extra,
  };
}
