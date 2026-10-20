import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { pngFile, review, vocabulary } from "./fixtures";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubVocabulary(extra?: (url: string, method: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/vocabulary")) return json(vocabulary);
      if (url.endsWith("/api/artworks") && method === "GET") return json({ artworks: [] });
      if (extra) return extra(url, method, init);
      return json({ error: "not found" }, 404);
    }),
  );
}

async function readyForm() {
  const user = userEvent.setup();
  render(<App />);
  const [upload] = await screen.findAllByRole("button", { name: "Upload artwork" });
  await user.click(upload);
  const form = await screen.findByRole("form", { name: "Upload artwork" });
  await waitFor(() => {
    expect(within(form).getByRole("button", { name: "Upload artwork" })).toBeEnabled();
  });
}

describe("artwork image upload", () => {
  it("previews a selected image and can remove or replace it", async () => {
    const user = userEvent.setup();
    stubVocabulary();
    await readyForm();
    const input = screen.getByLabelText("Artwork image");
    await user.upload(input, pngFile("river.png"));
    expect(screen.getByAltText("Selected artwork preview")).toHaveAttribute("src", expect.stringContaining("blob:"));
    expect(screen.getByText("river.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(screen.queryByText("river.png")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Selected artwork preview")).not.toBeInTheDocument();

    await user.upload(input, pngFile("replaced.png"));
    expect(screen.getByText("replaced.png")).toBeInTheDocument();
  });

  it("rejects a file that is not a JPEG, PNG, or WebP and rejects an oversized file", async () => {
    stubVocabulary();
    await readyForm();
    const input = screen.getByLabelText("Artwork image");
    const gif = new File([Uint8Array.from([0x47, 0x49, 0x46])], "motion.gif", { type: "image/gif" });
    fireEvent.change(input, { target: { files: [gif] } });
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG, or WebP");
    expect(screen.queryByAltText("Selected artwork preview")).not.toBeInTheDocument();

    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole("alert")).toHaveTextContent("10 MB");
  });

  it("accepts a dropped image", async () => {
    stubVocabulary();
    await readyForm();
    const zone = screen.getByText("Drop an image here, or choose a file.").parentElement;
    expect(zone).toBeTruthy();
    fireEvent.drop(zone as HTMLElement, {
      dataTransfer: { files: [pngFile("dropped.png")] },
    });
    expect(await screen.findByText("dropped.png")).toBeInTheDocument();
  });

  it("submits multipart data and shows the stored image in the conversation, review panel, and list", async () => {
    const user = userEvent.setup();
    const created = review("request_information", "Request information", {
      image: "/api/uploads/abc123.png",
      artwork_id: "river-study",
      records: [
        { fact_id: "fact-1", role: "title", value: "River Study" },
        { fact_id: "fact-2", role: "description", value: "A paper river." },
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
              artwork_id: "river-study",
              title: "River Study",
              recommendation: "request_information",
              label: "Request information",
              image: "/api/uploads/abc123.png",
            },
          ],
        });
      }
      if (url.endsWith("/api/artworks") && method === "POST") return json(created);
      return json({ error: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm();
    await user.type(screen.getByLabelText("Title"), "River Study");
    await user.upload(screen.getByLabelText("Artwork image"), pngFile("river.png"));
    await user.click(within(screen.getByRole("form", { name: "Upload artwork" })).getByRole("button", { name: "Upload artwork" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Request information");
    const shown = document.querySelector(".review .artwork-frame img");
    expect(shown).toHaveAttribute("alt", "Artwork: River Study");
    expect(shown).toHaveAttribute("src", "/api/uploads/abc123.png");
    await user.click(screen.getByRole("button", { name: "Submissions" }));
    expect(screen.getByRole("button", { name: /River Study/ }).querySelector("img")).toHaveAttribute(
      "src",
      "/api/uploads/abc123.png",
    );
    const posted = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")?.[1]?.body;
    expect(posted).toBeInstanceOf(FormData);
    expect((posted as FormData).get("title")).toBe("River Study");
    expect((posted as FormData).get("image")).toBeInstanceOf(File);
  });

  it("keeps the entered details when the upload is rejected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/vocabulary")) return json(vocabulary);
        if (url.endsWith("/api/artworks") && method === "GET") return json({ artworks: [] });
        if (method === "POST") return json({ error: "The image could not be saved." }, 400);
        return json({ error: "not found" }, 404);
      }),
    );
    await readyForm();
    await user.type(screen.getByLabelText("Title"), "River Study");
    await user.type(screen.getByLabelText("Description"), "A paper river.");
    await user.upload(screen.getByLabelText("Artwork image"), pngFile("river.png"));
    await user.click(within(screen.getByRole("form", { name: "Upload artwork" })).getByRole("button", { name: "Upload artwork" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByLabelText("Title")).toHaveValue("River Study");
    expect(screen.getByLabelText("Description")).toHaveValue("A paper river.");
    expect(screen.getByText("river.png")).toBeInTheDocument();
    expect(within(screen.getByRole("form", { name: "Upload artwork" })).getByRole("button", { name: "Upload artwork" })).toBeEnabled();
  });

  it("does not send a second submission while the first request is in progress", async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/vocabulary")) return json(vocabulary);
      if (url.endsWith("/api/artworks") && method === "GET") return json({ artworks: [] });
      if (method === "POST") return pending;
      return json({ error: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    await readyForm();
    await user.upload(screen.getByLabelText("Artwork image"), pngFile());
    await user.click(within(screen.getByRole("form", { name: "Upload artwork" })).getByRole("button", { name: "Upload artwork" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    });
    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === "POST");
    expect(posts).toHaveLength(1);
    release(json(review("request_information", "Request information", { image: "/api/uploads/abc.png" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Request information");
  });

  it("shows a placeholder for a stored artwork that has no image", async () => {
    const user = userEvent.setup();
    const opened = review("request_information", "Request information", { image: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
                image: null,
              },
            ],
          });
        }
        if (url.endsWith("/api/artworks/paths-to-peace") && method === "GET") return json(opened);
        return json({ error: "not found" }, 404);
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Submissions" }));
    expect(screen.getByText("No image")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Paths to Peace/ }));
    expect(document.querySelector(".review .image-missing")).toHaveTextContent("No image");
    expect(screen.queryByRole("button", { name: /Paths to Peace/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See reasoning" }));
    expect(screen.getByText("Permission was not supplied, so it is not treated as confirmed.")).toBeInTheDocument();
  });

  it("keeps the artwork image available in the conversation at a narrow width", async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: String(query).includes("960"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const opened = review("human_review", "Human review", { image: "/api/uploads/narrow.png" });
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
                recommendation: "human_review",
                label: "Human review",
                image: "/api/uploads/narrow.png",
              },
            ],
          });
        }
        if (url.endsWith("/api/artworks/paths-to-peace")) return json(opened);
        return json({ error: "not found" }, 404);
      }),
    );
    try {
      render(<App />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Submissions" }));
      const drawer = document.getElementById("submission-drawer");
      expect(drawer).not.toHaveAttribute("hidden");
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Paths to Peace/ }));
      const shown = document.querySelector(".review .artwork-frame img");
      expect(shown).toHaveAttribute("alt", "Artwork: Paths to Peace");
      expect(shown).toHaveAttribute("src", "/api/uploads/narrow.png");
      expect(drawer).toHaveAttribute("hidden");
    } finally {
      window.matchMedia = original;
    }
  });
});
