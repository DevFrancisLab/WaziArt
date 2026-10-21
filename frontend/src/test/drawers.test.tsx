import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { review, vocabulary } from "./fixtures";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(artworks: unknown[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/vocabulary")) return json(vocabulary);
      if (url.endsWith("/api/artworks")) return json({ artworks });
      if (url.endsWith("/api/artworks/paths-to-peace")) {
        return json(review("request_information", "Request information", { image: "/api/uploads/peace.png" }));
      }
      return json({ error: "not found" }, 404);
    }),
  );
}

describe("side drawers", () => {
  it("keeps an unsaved upload when the drawer is closed and opened again", async () => {
    const user = userEvent.setup();
    installFetch();
    render(<App />);
    await user.click((await screen.findAllByRole("button", { name: "Upload artwork" }))[0]);
    const form = await screen.findByRole("form", { name: "Upload artwork" });
    await user.type(within(form).getByLabelText("Title"), "River Study");
    await user.type(within(form).getByLabelText("Description"), "A paper river.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("form", { name: "Upload artwork" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload artwork" }));
    expect(screen.getByLabelText("Title")).toHaveValue("River Study");
    expect(screen.getByLabelText("Description")).toHaveValue("A paper river.");
  });

  it("lets one drawer replace the other and closes from the backdrop", async () => {
    const user = userEvent.setup();
    installFetch();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Submissions" }));
    const submissions = await screen.findByRole("dialog", { name: "Submissions" });
    expect(submissions).toHaveClass("modal", "submission-panel");
    expect(submissions).not.toHaveClass("drawer");
    expect(within(submissions).getByText("No artwork yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upload artwork" }));
    expect(screen.queryByRole("dialog", { name: "Submissions" })).not.toBeInTheDocument();
    const upload = screen.getByRole("dialog", { name: "Upload artwork" });
    expect(upload).toHaveClass("modal");
    expect(upload).not.toHaveClass("drawer");

    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters stored artworks, loads the selected review, and opens its reasoning", async () => {
    const user = userEvent.setup();
    installFetch([
      {
        artwork_id: "paths-to-peace",
        title: "Paths to Peace",
        recommendation: "request_information",
        label: "Request information",
        image: "/api/uploads/peace.png",
      },
      {
        artwork_id: "river-study",
        title: "River Study",
        recommendation: "human_review",
        label: "Human review",
      },
    ]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Submissions" }));
    await user.type(screen.getByLabelText("Filter"), "river");
    expect(screen.queryByRole("button", { name: /Paths to Peace/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /River Study/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Filter"));
    await user.type(screen.getByLabelText("Filter"), "zzzz");
    expect(screen.getByText("No match.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Filter"));

    await user.click(screen.getByRole("button", { name: /Paths to Peace/ }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Request information");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const shown = document.querySelector(".review .artwork-frame img");
    expect(shown).toHaveAttribute("src", "/api/uploads/peace.png");

    await user.click(screen.getByRole("button", { name: "See reasoning" }));
    const reasoning = screen.getByRole("dialog", { name: "See reasoning" });
    expect(reasoning).toHaveClass("modal", "reasoning-panel");
    expect(reasoning).not.toHaveClass("drawer");
    expect(within(reasoning).getByText("Permission was not supplied, so it is not treated as confirmed.")).toBeInTheDocument();
    expect(within(reasoning).getByText("Facts")).toBeInTheDocument();
    expect(within(reasoning).getByText("Reasoning trace")).toBeInTheDocument();
    expect(within(reasoning).getByRole("heading", { name: "Correct information" })).toBeInTheDocument();
    await user.selectOptions(within(reasoning).getByLabelText("Fact"), "permission|");
    await user.selectOptions(within(reasoning).getByLabelText("Corrected permission"), "confirmed");
    await user.click(within(reasoning).getByRole("button", { name: "Correct information" }));
    expect(within(reasoning).getByRole("button", { name: "Confirm correction" })).toBeInTheDocument();
    expect(within(reasoning).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await user.click(within(reasoning).getByRole("button", { name: "Cancel" }));
    expect(within(reasoning).queryByRole("button", { name: "Confirm correction" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submissions" }));
    expect(screen.queryByRole("dialog", { name: "See reasoning" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Submissions" })).toBeInTheDocument();
  });

  it("opens submissions in a centered panel with a close control at a narrow width", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: String(query).includes("960"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    installFetch();
    try {
      render(<App />);
      await userEvent.setup().click(await screen.findByRole("button", { name: "Submissions" }));
      const drawer = document.getElementById("submission-drawer") as HTMLElement;
      expect(drawer).not.toHaveAttribute("hidden");
      expect(drawer).toHaveClass("modal", "submission-panel");
      expect(drawer).not.toHaveClass("drawer");
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    } finally {
      window.matchMedia = original;
    }
  });
});
