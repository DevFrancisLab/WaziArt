import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { RecommendationPanel } from "../components/RecommendationPanel";
import { ReasoningGraph } from "../components/ReasoningGraph";
import { ReasoningTrace } from "../components/ReasoningTrace";
import { review, vocabulary } from "./fixtures";

/**
 * These tests stub fetch so the interface can be checked without a running server.
 * The recommendation text is whatever the stub returns. A separate browser pass
 * talks to the real Python API.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("review journey", () => {
  it("shows the recommendation, trace, and revision returned by the API", async () => {
    const user = userEvent.setup();
    const first = review("request_information", "Request information");
    const revised = review("recommend_for_review", "Recommend for review", {
      trace: [
        {
          expr: "(trace rule-recommendation (outcome recommend_for_review))",
          rule: "rule-recommendation",
          kind: "recommendation",
          summary: "The rules infer the recommendation recommend_for_review.",
        },
      ],
      revisions: [
        {
          revision_id: "revision-1",
          before: "request_information",
          after: "recommend_for_review",
          expr: "(revision revision-1 request_information recommend_for_review)",
          latest: true,
          summary: "The recommendation changed from request_information to recommend_for_review.",
          before_label: "Request information",
          after_label: "Recommend for review",
        },
      ],
      challenges: [
        {
          challenge_id: "challenge-1",
          action: "correct",
          previous_fact: "none",
          new_fact: "fact-6",
          previous_value: null,
          new_value: "confirmed",
          note: "Letter received.",
          expr: "(challenge-view challenge-1 correct none fact-6)",
        },
      ],
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/vocabulary")) return json(vocabulary);
      if (url.endsWith("/api/artworks") && method === "GET") return json({ artworks: [] });
      if (url.endsWith("/api/artworks") && method === "POST") return json(first);
      if (url.includes("/challenges") && method === "POST") return json(revised);
      return json({ error: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the exhibition vocabulary.");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();
    });
    expect(screen.getByRole("status")).toHaveTextContent("No submissions are stored");

    await user.click(screen.getByRole("button", { name: "Fill: permission not supplied" }));
    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Request information (request_information)");
    });
    expect(screen.getByText("Permission was not supplied, so it is not treated as confirmed.")).toBeInTheDocument();
    expect(screen.getAllByText("has-evidence").length).toBeGreaterThan(0);
    expect(screen.getByText("Exhibition criterion")).toBeInTheDocument();
    const submitCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/api/artworks") && call[1]?.method === "POST");
    expect(submitCall).toBeTruthy();
    const posted = JSON.parse(String(submitCall?.[1]?.body));
    expect(posted.permission).toBe("");
    expect(posted.description).toContain("paper river");
    expect(posted.evidence[0].concept).toBe("reconciliation");

    await user.selectOptions(screen.getByLabelText("Fact"), "permission|");
    await user.selectOptions(screen.getByLabelText("Corrected permission"), "confirmed");
    await user.type(screen.getByLabelText("Note optional"), "Letter received.");
    await user.click(screen.getByRole("button", { name: "Record challenge and reassess" }));

    expect(await screen.findByText(/changed from request_information to recommend_for_review/)).toBeInTheDocument();
    expect(screen.getByText(/Previous value: Not supplied/)).toBeInTheDocument();
    expect(screen.getByText(/Note: Letter received./)).toBeInTheDocument();
    expect(screen.getByText("superseded")).toBeInTheDocument();
    const challengeCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/challenges"));
    const challengeBody = JSON.parse(String(challengeCall?.[1]?.body));
    expect(challengeBody).toMatchObject({ role: "permission", action: "correct", value: "confirmed", note: "Letter received." });
  });

  it("announces a validation error and an API error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/vocabulary")) return json(vocabulary);
        if (url.endsWith("/api/artworks") && method === "GET") return json({ artworks: [] });
        if (method === "POST") return json({ error: "Permission must be confirmed, missing, disputed, or left blank." }, 400);
        return json({ error: "not found" }, 404);
      }),
    );

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();
    });
    await user.type(screen.getByLabelText(/Identifier/), "BAD ID");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("short lowercase token");

    await user.clear(screen.getByLabelText(/Identifier/));
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Permission must be confirmed");
    });
  });

  it("renders an empty relationship list and a service failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "The review service failed before it could answer." }, 500)));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("failed before it could answer");
    render(<ReasoningGraph edges={[]} />);
    expect(screen.getByText("No reasoning relationships were returned for this review.")).toBeInTheDocument();
  });

  it("reopens a stored submission from the list and keeps it after another open fails", async () => {
    const user = userEvent.setup();
    const opened = review("request_information", "Request information");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/vocabulary")) return json(vocabulary);
        if (url.endsWith("/api/artworks")) {
          return json({
            artworks: [
              {
                artwork_id: "paths-to-peace",
                title: "Paths to Peace",
                recommendation: "request_information",
                label: "Request information",
              },
              {
                artwork_id: "missing-work",
                title: "Missing",
                recommendation: "human_review",
                label: "Human review",
              },
            ],
          });
        }
        if (url.endsWith("/api/artworks/paths-to-peace")) return json(opened);
        if (url.endsWith("/api/artworks/missing-work")) return json({ error: "No submission is stored for missing-work." }, 404);
        return json({ error: "not found" }, 404);
      }),
    );

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /Paths to Peace/ }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Request information (request_information)");
    });
    expect(window.location.search).toContain("artwork=paths-to-peace");

    await user.click(screen.getByRole("button", { name: /Missing/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No submission is stored for missing-work.");
    expect(screen.getByRole("status")).toHaveTextContent("Request information (request_information)");
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
  });

  it("reloads the artwork named in the address from the API", async () => {
    window.history.replaceState(null, "", "/?artwork=paths-to-peace");
    const opened = review("human_review", "Human review", {
      revisions: [
        {
          revision_id: "revision-1",
          before: "request_information",
          after: "human_review",
          expr: "(revision revision-1 request_information human_review)",
          latest: true,
          summary: "The recommendation changed from request_information to human_review.",
          before_label: "Request information",
          after_label: "Human review",
        },
      ],
      challenges: [
        {
          challenge_id: "challenge-1",
          action: "dispute",
          previous_fact: "fact-4",
          new_fact: "none",
          previous_value: "reconciliation",
          new_value: null,
          note: "The concept is contested.",
          expr: "(challenge-view challenge-1 dispute fact-4 none)",
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/vocabulary")) return json(vocabulary);
        if (url.endsWith("/api/artworks")) return json({ artworks: [] });
        if (url.endsWith("/api/artworks/paths-to-peace")) return json(opened);
        return json({ error: "not found" }, 404);
      }),
    );

    render(<App />);
    expect(await screen.findByText(/changed from request_information to human_review/)).toBeInTheDocument();
    expect(screen.getByText(/Previous value: reconciliation/)).toBeInTheDocument();
    expect(screen.getByText(/Note: The concept is contested./)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Human review (human_review)");
  });

  it("displays the recommendation symbol from the payload", () => {
    render(<RecommendationPanel review={review("human_review", "Human review")} vocabulary={vocabulary} />);
    expect(screen.getAllByText("human_review").length).toBeGreaterThan(0);
    expect(screen.getByText("Human review")).toBeInTheDocument();
    render(<ReasoningTrace trace={review("human_review", "Human review").trace} />);
    expect(screen.getByText("The rules infer the recommendation human_review.")).toBeInTheDocument();
  });
});
