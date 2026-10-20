import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { SimpleExplanation } from "../components/SimpleExplanation";
import { review, vocabulary } from "./fixtures";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("simple explanation", () => {
  it("keeps the MeTTa review and requests Qwen only after Explain simply", async () => {
    const user = userEvent.setup();
    const opened = review("request_information", "Request information");
    const revised = review("recommend_for_review", "Recommend for review", {
      revisions: [
        {
          revision_id: "revision-2",
          before: "request_information",
          after: "recommend_for_review",
          expr: "(revision revision-2 request_information recommend_for_review)",
          latest: true,
          summary: "The recommendation changed from request_information to recommend_for_review.",
          before_label: "Request information",
          after_label: "Recommend for review",
        },
      ],
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/vocabulary")) return json(vocabulary);
      if (url.endsWith("/api/artworks") && method === "GET") {
        return json({
          artworks: [
            {
              artwork_id: "paths-to-peace",
              title: "Paths to Peace",
              recommendation: "request_information",
              label: "Request information",
            },
          ],
        });
      }
      if (url.endsWith("/api/artworks/paths-to-peace") && method === "GET") return json(opened);
      if (url.endsWith("/explanation") && method === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return json({
          artwork_id: "paths-to-peace",
          recommendation: "request_information",
          label: "Request information",
          revision: "abc",
          provider: "groq",
          model: "qwen/qwen3.8-27b",
          explanation: "Permission was not supplied, so a reviewer should ask for it.",
          kind: "llm",
        });
      }
      if (url.includes("/challenges") && method === "POST") return json(revised);
      return json({ error: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Submissions" }));
    await user.click(await screen.findByRole("button", { name: /Paths to Peace/ }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Request information");
    });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/explanation"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "See reasoning" }));
    const drawer = screen.getByRole("dialog", { name: "See reasoning" });
    expect(within(drawer).getByRole("heading", { name: "Detailed reasoning" })).toBeInTheDocument();
    expect(within(drawer).getByText("Rule explanation")).toBeInTheDocument();
    expect(within(drawer).getByText(/Permission was not supplied/)).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Explain simply" }));
    expect(within(drawer).getByRole("button", { name: "Explaining…" })).toBeDisabled();
    expect(within(drawer).getByText("Writing a simple explanation…")).toBeInTheDocument();
    expect(await within(drawer).findByText(/Permission was not supplied, so a reviewer should ask/)).toBeInTheDocument();
    expect(within(drawer).getByText(/Simple explanation \(Qwen\)/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Request information");
    const explainCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/explanation"));
    expect(JSON.parse(String(explainCall?.[1]?.body))).toEqual({});

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/explanation")) return json({ error: "The explanation service timed out. The MeTTa review is unchanged." }, 504);
      return json(opened);
    });
    await user.click(within(drawer).getByRole("button", { name: "Try again" }));
    expect(await within(drawer).findByRole("alert")).toHaveTextContent("timed out");
    expect(within(drawer).getByText(/Permission was not supplied, so it is not treated as confirmed/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Request information");
    expect(within(drawer).queryByText(/so a reviewer should ask/)).not.toBeInTheDocument();
  });

  it("does not show an explanation from a different recommendation", () => {
    const current = review("recommend_for_review", "Recommend for review");
    render(
      <SimpleExplanation
        review={current}
        explanation={{
          stamp: "old",
          artworkId: "paths-to-peace",
          recommendation: "request_information",
          text: "Old explanation that no longer applies.",
          model: "qwen/qwen3.8-27b",
        }}
        error=""
        pending={false}
        onExplain={() => undefined}
      />,
    );
    expect(screen.queryByText(/Old explanation/)).not.toBeInTheDocument();
    expect(screen.getByText(/Recommend for review/)).toBeInTheDocument();
  });
});
