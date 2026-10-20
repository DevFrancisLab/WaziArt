import type { Review, Vocabulary } from "./types";

/**
 * Turns a reviewer message into either an answer drawn from the current
 * review or a correction that still needs an explicit confirm.
 * Nothing here chooses a recommendation or writes a fact.
 */

export interface Proposal {
  role: "permission" | "evidence";
  action: "correct" | "dispute";
  value: string;
  evidenceId: string;
  fieldLabel: string;
  valueLabel: string;
  note: string;
}

export type SectionKey = "trace" | "graph" | "revision" | "history";

export interface Answer {
  type: "answer";
  text: string;
  open?: SectionKey;
}

export interface Confirmation {
  type: "confirm";
  text: string;
  proposal: Proposal;
}

export interface Clarification {
  type: "clarify";
  text: string;
}

export type Interpretation = Answer | Confirmation | Clarification;

export interface ThreadMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  proposal?: Proposal;
  sent?: boolean;
}

const FALLBACK_PERMISSIONS = ["confirmed", "missing", "disputed"];

export function openingText(review: Review): string {
  const title = review.records.find((record) => record.role === "title")?.value || review.artwork_id;
  return [
    `You are reviewing ${title}.`,
    `${review.label} (${review.recommendation}).`,
    review.status_note,
    review.disclaimer,
    "Ask about this review, or propose a correction. A correction is saved only after you confirm it.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function challengeResultText(review: Review): string {
  const latest = review.revisions.find((revision) => revision.latest) ?? review.revisions[review.revisions.length - 1];
  if (!latest) {
    return `${review.label} (${review.recommendation}). The review service returned an updated review.`;
  }
  if (latest.before === latest.after) {
    return `The recommendation stayed ${latest.after_label} (${latest.after}). The correction is in the updated review.`;
  }
  return `The recommendation is now ${latest.after_label} (${latest.after}). It was ${latest.before_label} (${latest.before}). The stored comparison is under What changed.`;
}

export function suggestionChips(review: Review): string[] {
  const chips = ["Why this recommendation?", "Show the reasoning trace", "Open the relationship graph"];
  if (review.recommendation === "request_information") chips.unshift("Which fact is missing?");
  if (review.revisions.length > 0) chips.push("Show me what changed after that correction.");
  const permission = review.records.find((record) => record.role === "permission");
  if (!permission || permission.value !== "confirmed") chips.push("I have confirmed permission to exhibit.");
  return chips;
}

/** Where the visible next action should send the reviewer. The symbol comes from the API. */
export function nextStep(recommendation: string): { label: string; hint: string; target: "challenge" | "trace" } {
  if (recommendation === "request_information") {
    return {
      label: "Correct a missing fact",
      hint: "Supply a fact the review says was not provided. This is not a rejection.",
      target: "challenge",
    };
  }
  if (recommendation === "recommend_for_review") {
    return {
      label: "Inspect the reasoning",
      hint: "A person should review the work. This is not acceptance.",
      target: "trace",
    };
  }
  if (recommendation === "human_review") {
    return {
      label: "Review the disputed or unclear facts",
      hint: "A person needs to look at this submission. This is not a rejection.",
      target: "challenge",
    };
  }
  return {
    label: "Inspect the reasoning",
    hint: "The recommendation was returned by the review service.",
    target: "trace",
  };
}

export function interpretMessage(input: string, review: Review | null, vocabulary: Vocabulary | null): Interpretation {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) {
    return {
      type: "clarify",
      text: "Write a question about this review, or propose one correction such as confirmed permission.",
    };
  }
  if (!review) {
    return {
      type: "clarify",
      text: "No artwork is open. Submit an artwork or open a stored submission. Answers come from the review the API returns.",
    };
  }

  const proposal = proposeCorrection(input.trim(), text, review, vocabulary);
  const asking = looksLikeQuestion(text);
  if (asking && !proposal) return answerFromReview(text, review);
  if (proposal && asking) {
    return {
      type: "clarify",
      text: "That message mixes a question and a correction. Ask the question, or name one field and one value.",
    };
  }
  if (proposal) {
    const change =
      proposal.action === "dispute"
        ? `Action: dispute ${proposal.fieldLabel}.`
        : `Proposed value: ${proposal.valueLabel}.`;
    return {
      type: "confirm",
      proposal,
      text: `Confirm this correction before it is saved. Field: ${proposal.fieldLabel}. ${change} Nothing changes until you confirm.`,
    };
  }
  if (mentionsCorrectionIntent(text)) {
    return {
      type: "clarify",
      text: "Name one supported field and value, such as permission confirmed, or use the correction form. A fact is not guessed from the description.",
    };
  }
  return answerFromReview(text, review);
}

function proposeCorrection(
  original: string,
  text: string,
  review: Review,
  vocabulary: Vocabulary | null,
): Proposal | null {
  const permissions = vocabulary?.permissions?.length ? vocabulary.permissions : FALLBACK_PERMISSIONS;
  const concepts = vocabulary?.concepts ?? [];
  const permissionHits = permissions.filter((status) => new RegExp(`\\b${escapeRegExp(status)}\\b`).test(text));
  const evidenceHits = concepts.filter((concept) => new RegExp(`\\b${escapeRegExp(concept).replace(/\\-/g, "[- ]")}\\b`).test(text));
  const mentionsPermission = /\bpermission\b|\bright to exhibit\b/.test(text);
  const mentionsEvidence = /\bevidence\b|\bconcept\b/.test(text);

  if (mentionsPermission && mentionsEvidence) return null;
  if (permissionHits.length > 1 || evidenceHits.length > 1) return null;

  if (/\bdispute(?:\s+the)?\s+permission\b/.test(text) && !permissionHits.includes("disputed")) {
    const record = review.records.find((item) => item.role === "permission");
    if (!record) return null;
    return {
      role: "permission",
      action: "dispute",
      value: "",
      evidenceId: "",
      fieldLabel: "permission",
      valueLabel: record.value,
      note: original,
    };
  }

  if (mentionsPermission && permissionHits.length === 1 && evidenceHits.length === 0) {
    return {
      role: "permission",
      action: "correct",
      value: permissionHits[0],
      evidenceId: "",
      fieldLabel: "permission",
      valueLabel: permissionHits[0],
      note: original,
    };
  }

  if (mentionsEvidence && evidenceHits.length === 1 && permissionHits.length === 0) {
    const concept = evidenceHits[0];
    const existing = review.records.filter((record) => record.role === "evidence" && record.evidence_id);
    if (/\bdispute\b/.test(text)) {
      const record = existing.find((item) => item.value === concept);
      if (!record?.evidence_id) return null;
      return {
        role: "evidence",
        action: "dispute",
        value: "",
        evidenceId: record.evidence_id,
        fieldLabel: `evidence ${record.evidence_id}`,
        valueLabel: concept,
        note: original,
      };
    }
    if (existing.length === 0 || /\badd\b/.test(text)) {
      return {
        role: "evidence",
        action: "correct",
        value: concept,
        evidenceId: "",
        fieldLabel: "evidence",
        valueLabel: concept,
        note: original,
      };
    }
    if (existing.length === 1 && /\b(change|correct|replace|set)\b/.test(text)) {
      return {
        role: "evidence",
        action: "correct",
        value: concept,
        evidenceId: existing[0].evidence_id ?? "",
        fieldLabel: `evidence ${existing[0].evidence_id}`,
        valueLabel: concept,
        note: original,
      };
    }
    return null;
  }

  return null;
}

function answerFromReview(text: string, review: Review): Answer {
  if (/(trace|why this recommendation|supporting reasoning|show the reasoning)/.test(text)) {
    const count = review.trace.length;
    return {
      type: "answer",
      open: "trace",
      text:
        count === 0
          ? "No trace items were returned for this review."
          : `The reasoning trace has ${count} returned item${count === 1 ? "" : "s"}. They are open under Why this recommendation. Each sentence is a reading of a returned expression.`,
    };
  }
  if (/(graph|relationship)/.test(text)) {
    const count = review.edges.length;
    return {
      type: "answer",
      open: "graph",
      text:
        count === 0
          ? "This review did not include any reasoning relationships."
          : `The API returned ${count} relationship${count === 1 ? "" : "s"}. The drawing and the table use those edges only.`,
    };
  }
  if (/(what changed|revision|after that correction|after the correction)/.test(text)) {
    if (review.revisions.length === 0) {
      return {
        type: "answer",
        open: "revision",
        text: "No revision has been recorded for this submission yet.",
      };
    }
    return {
      type: "answer",
      open: "revision",
      text: "The stored before-and-after comparison is open under What changed.",
    };
  }
  if (/(history|audit|earlier challenge|previous correction)/.test(text)) {
    return {
      type: "answer",
      open: "history",
      text:
        review.challenges.length === 0
          ? "No challenge has been recorded for this submission yet. Stored facts are listed under Review history."
          : `This review has ${review.challenges.length} recorded challenge${review.challenges.length === 1 ? "" : "s"}. The notes and fact values are under Review history.`,
    };
  }
  if (/(which fact|what is missing|missing fact|not supplied|what is required)/.test(text)) {
    const missing = review.trace.filter((item) => item.kind === "missing" || /not supplied|\bmissing\b/i.test(item.summary));
    return {
      type: "answer",
      open: "trace",
      text:
        missing.length === 0
          ? "The returned trace does not name a missing fact."
          : `The trace marks ${missing.length} item${missing.length === 1 ? "" : "s"} as missing or not supplied. Read them under Why this recommendation.`,
    };
  }
  if (/\bpermission\b/.test(text)) {
    const permission = review.records.find((record) => record.role === "permission");
    return {
      type: "answer",
      text: permission
        ? `The current permission fact is ${permission.value} (${permission.fact_id}).`
        : "Permission is not among the stored facts for this submission.",
    };
  }
  if (/\bevidence\b|\bconcept\b/.test(text)) {
    const evidence = review.records.filter((record) => record.role === "evidence");
    return {
      type: "answer",
      text:
        evidence.length === 0
          ? "No evidence concept is stored for this submission. The description is prose and is not used as evidence."
          : `Stored evidence: ${evidence.map((record) => `${record.value}${record.evidence_id ? ` (${record.evidence_id})` : ""}`).join(", ")}.`,
    };
  }
  return {
    type: "answer",
    text: `${review.label} (${review.recommendation}). ${review.status_note} Ask why, which fact is missing, or ask to see the trace, graph, or review history.`,
  };
}

function looksLikeQuestion(text: string): boolean {
  return text.includes("?") || /^(why|what|which|how|show|open|where)\b/.test(text);
}

function mentionsCorrectionIntent(text: string): boolean {
  return /\b(correct|correction|change|replace|set|update|dispute|add evidence|permission|confirmed|missing)\b/.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
