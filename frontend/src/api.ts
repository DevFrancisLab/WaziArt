import type { ArtworkSummary, ChallengeBody, Review, SubmissionBody, Vocabulary } from "./types";

/** Raised when the Python API returns an error body or an unreadable response. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ErrorBody {
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      "The review service is not responding. Start it with python -m waziart, then try again.",
      0,
    );
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      isErrorBody(data) && data.error
        ? data.error
        : `The review service returned status ${response.status}.`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null && "error" in value;
}

export function getVocabulary(): Promise<Vocabulary> {
  return request<Vocabulary>("/api/vocabulary");
}

export function listArtworks(): Promise<ArtworkSummary[]> {
  return request<{ artworks: ArtworkSummary[] }>("/api/artworks").then((body) => body.artworks);
}

export function getArtwork(artworkId: string): Promise<Review> {
  return request<Review>(`/api/artworks/${encodeURIComponent(artworkId)}`);
}

export function submitArtwork(body: SubmissionBody): Promise<Review> {
  return request<Review>("/api/artworks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function challengeArtwork(artworkId: string, body: ChallengeBody): Promise<Review> {
  return request<Review>(`/api/artworks/${encodeURIComponent(artworkId)}/challenges`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
