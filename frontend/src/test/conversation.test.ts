import { describe, expect, it } from "vitest";
import { challengeResultText, interpretMessage, openingText } from "../conversation";
import { review, vocabulary } from "./fixtures";

describe("conversation interpretation", () => {
  const current = review("request_information", "Request information");

  it("answers why from the returned recommendation without copying a trace sentence", () => {
    const result = interpretMessage("Why was this artwork flagged for more information?", current, vocabulary);
    expect(result.type).toBe("answer");
    if (result.type !== "answer") return;
    expect(result.text).toContain("Request information (request_information)");
    expect(result.text).not.toContain("Permission was not supplied");
  });

  it("points at the trace when a fact is missing", () => {
    const result = interpretMessage("Which fact is missing?", current, vocabulary);
    expect(result).toMatchObject({ type: "answer", open: "trace" });
    if (result.type !== "answer") return;
    expect(result.text).toContain("missing or not supplied");
  });

  it("asks for confirmation before a permission correction", () => {
    const result = interpretMessage("I have confirmed permission to exhibit.", current, vocabulary);
    expect(result.type).toBe("confirm");
    if (result.type !== "confirm") return;
    expect(result.proposal).toMatchObject({ role: "permission", action: "correct", value: "confirmed" });
    expect(result.text).toContain("Nothing changes until you confirm");
  });

  it("does not guess a correction from an ambiguous sentence", () => {
    const result = interpretMessage("Please change the artwork.", current, vocabulary);
    expect(result.type).toBe("clarify");
  });

  it("states honestly when a correction did not change the recommendation", () => {
    const same = review("human_review", "Human review", {
      revisions: [
        {
          revision_id: "revision-2",
          before: "human_review",
          after: "human_review",
          expr: "(revision revision-2 human_review human_review)",
          latest: true,
          summary: "The recommendation stayed human_review.",
          before_label: "Human review",
          after_label: "Human review",
        },
      ],
    });
    expect(challengeResultText(same)).toContain("stayed Human review (human_review)");
    expect(openingText(same)).toContain("Human review (human_review)");
  });
});
