/** JSON shapes returned by the Python review API. React does not invent these. */

export interface TraceItem {
  expr: string;
  rule: string;
  kind: string;
  summary: string;
}

export interface GraphEdge {
  expr: string;
  subject: string;
  relation: string;
  object: string;
  summary: string;
}

export interface FactRecord {
  fact_id: string;
  role: string;
  value: string;
  evidence_id?: string;
}

export interface HistoryFact extends FactRecord {
  status: "current" | "superseded" | string;
}

export interface Revision {
  revision_id: string;
  before: string;
  after: string;
  expr: string;
  latest: boolean;
  summary: string;
  before_label: string;
  after_label: string;
}

export interface ChallengeRecord {
  challenge_id: string;
  action: string;
  previous_fact: string;
  new_fact: string;
  previous_value: string | null;
  new_value: string | null;
  note: string;
  expr: string;
}

export interface Review {
  artwork_id: string;
  image?: string | null;
  recommendation: string;
  label: string;
  status_note: string;
  disclaimer: string;
  trace: TraceItem[];
  edges: GraphEdge[];
  records: FactRecord[];
  history: HistoryFact[];
  revisions: Revision[];
  challenges: ChallengeRecord[];
}

export interface Vocabulary {
  exhibition_theme: string;
  concepts: string[];
  permissions: string[];
  recommendations: string[];
}

export interface ArtworkSummary {
  artwork_id: string;
  title: string;
  recommendation: string;
  label: string;
  image?: string | null;
}

export interface EvidenceDraft {
  concept: string;
  note: string;
}

export interface SubmissionBody {
  artwork_id?: string;
  title: string;
  description: string;
  theme: string;
  permission: string;
  evidence: EvidenceDraft[];
}

export interface ChallengeBody {
  role: string;
  action: "correct" | "dispute";
  value: string;
  evidence_id: string;
  note: string;
}
