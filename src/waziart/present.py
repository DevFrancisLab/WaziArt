"""Turn MeTTa results into text a reviewer can read.

The sentences below describe atoms that inference already returned.
They do not choose a recommendation.
"""

from __future__ import annotations

from waziart import DISCLAIMER

LABELS = {
    "recommend_for_review": "Recommend for review",
    "request_information": "Request information",
    "human_review": "Human review",
}

STATUS_NOTES = {
    "recommend_for_review": "Ready for a person to review. The required facts align.",
    "request_information": "Incomplete. Something required has not been supplied.",
    "human_review": "Needs a person. The submission is disputed or does not clearly align.",
}


def present_review(review: dict) -> dict:
    """Add display text to a review dictionary. Raw MeTTa expressions stay intact."""
    recommendation = review["recommendation"]
    presented = dict(review)
    presented["label"] = LABELS.get(recommendation, recommendation)
    presented["status_note"] = STATUS_NOTES.get(recommendation, "")
    presented["disclaimer"] = DISCLAIMER
    presented["trace"] = [present_trace(item) for item in review["trace"]]
    presented["edges"] = [present_edge(item) for item in review["edges"]]
    presented["revisions"] = [present_revision(item) for item in review["revisions"]]
    return presented


def present_trace(item: dict) -> dict:
    """Describe one ``(trace Rule Payload)`` result."""
    payload = _payload(item["data"])
    return {
        "expr": item["expr"],
        "rule": _rule_name(item["data"]),
        "kind": _kind(payload),
        "summary": _trace_summary(payload, item["expr"]),
    }


def present_edge(item: dict) -> dict:
    """Describe one ``(edge Subject Relation Object)`` result."""
    values = _edge_values(item["data"])
    if len(values) >= 4 and values[1] == "changes":
        summary = (
            f"{values[0]} changes the recommendation from {values[2]} to {values[3]}."
        )
        obj = f"{values[2]} → {values[3]}"
    elif len(values) >= 3:
        summary = f"{values[0]} {values[1].replace('-', ' ')} {values[2]}."
        obj = values[2]
    else:
        summary = item["expr"]
        obj = ""
    return {
        "expr": item["expr"],
        "subject": values[0] if values else "",
        "relation": values[1] if len(values) > 1 else "",
        "object": obj,
        "summary": summary,
    }


def present_revision(item: dict) -> dict:
    """Describe a stored before/after pair returned by MeTTa."""
    before = item["before"]
    after = item["after"]
    if before == after:
        summary = f"The recommendation stayed {after}."
    else:
        summary = f"The recommendation changed from {before} to {after}."
    presented = dict(item)
    presented["summary"] = summary
    presented["before_label"] = LABELS.get(before, before)
    presented["after_label"] = LABELS.get(after, after)
    return presented


def _rule_name(data: dict) -> str:
    children = data.get("children") or []
    if len(children) > 1 and children[1].get("kind") == "symbol":
        return children[1]["value"]
    return ""


def _payload(data: dict) -> dict | None:
    children = data.get("children") or []
    if len(children) < 3:
        return None
    return children[2]


def _kind(payload: dict | None) -> str:
    head = _head(payload)
    if head == "missing":
        return "missing"
    if head == "supplied":
        return "supplied"
    if head == "disputed":
        return "disputed"
    if head == "outcome":
        return "recommendation"
    return "inferred"


def _head(node: dict | None) -> str:
    if not node:
        return ""
    if node.get("kind") == "symbol":
        return node["value"]
    if node.get("kind") == "expr" and node.get("children"):
        first = node["children"][0]
        if first.get("kind") == "symbol":
            return first["value"]
    return ""


def _args(node: dict | None) -> list[dict]:
    if not node or node.get("kind") != "expr":
        return []
    return node["children"][1:]


def _text(node: dict | None) -> str:
    if not node:
        return ""
    if node.get("kind") in {"symbol", "string"}:
        return str(node.get("value", ""))
    if node.get("kind") == "expr":
        return " ".join(_text(child) for child in node.get("children") or [])
    return ""


def _trace_summary(payload: dict | None, fallback: str) -> str:
    head = _head(payload)
    args = _args(payload)
    if head == "missing" and args:
        field_name = _text(args[0]).replace("-", " ")
        if field_name == "permission":
            return "Permission was not supplied, so it is not treated as confirmed."
        if field_name == "evidence":
            return "No evidence concept was supplied. Description text is not treated as evidence."
        return f"The {field_name} was not supplied."
    if head == "supplied" and args:
        return _supplied_summary(args)
    if head == "aligned":
        return f"The stated theme matches the exhibition theme, {_text(args[0])}."
    if head == "not-aligned":
        return f"The stated theme is {_text(args[0])}, which is not the exhibition theme."
    if head == "supports" and args:
        return _supports_summary(args[0])
    if head == "evidence-does-not-support-theme" or (
        payload and payload.get("kind") == "symbol" and payload.get("value") == "evidence-does-not-support-theme"
    ):
        return "Evidence was supplied, and none of it supports the exhibition theme."
    if head == "disputed":
        target = _text(args[0]) if args else "a fact"
        if target == "permission":
            return "Permission is disputed, so a person needs to review the submission."
        return f"{target} is disputed, so a person needs to review the submission."
    if payload and payload.get("kind") == "symbol":
        value = payload["value"]
        if value == "dispute-takes-precedence-over-missing-information":
            return (
                "Disputed information takes precedence over missing information, "
                "so the recommendation is human review."
            )
        if value == "criteria-not-jointly-satisfied":
            return "The supplied facts do not jointly satisfy the exhibition criteria."
        if value == "evidence-does-not-support-theme":
            return "Evidence was supplied, and none of it supports the exhibition theme."
    if head == "outcome" and args:
        symbol = _text(args[0])
        return f"The rules infer the recommendation {symbol}."
    return fallback


def _supplied_summary(args: list[dict]) -> str:
    field_name = _text(args[0])
    if field_name == "title" and len(args) > 1:
        return f"The artist supplied the title “{_text(args[1])}”."
    if field_name == "description":
        return "The description was recorded as text and was not interpreted."
    if field_name == "confirmed":
        return "Permission is confirmed."
    if field_name == "missing":
        return "The artist marked permission as missing. That is not a confirmed permission."
    if field_name == "disputed":
        return "The artist marked permission as disputed."
    if field_name == "evidence" and len(args) > 1:
        details = args[1]
        parts = details.get("children") or []
        evidence_id = _text(parts[0]) if parts else ""
        concept = _text(parts[1]) if len(parts) > 1 else ""
        return f"Evidence {evidence_id} names the concept {concept}."
    return f"The artist supplied {field_name}."


def _supports_summary(node: dict) -> str:
    parts = node.get("children") or []
    concept = _text(parts[1]) if len(parts) > 1 else ""
    criterion = _text(parts[2]) if len(parts) > 2 else ""
    return f"The concept {concept} supports the criterion {criterion}."


def _edge_values(data: dict) -> list[str]:
    children = data.get("children") or []
    if not children or children[0].get("value") != "edge":
        return []
    values = []
    for child in children[1:]:
        if child.get("kind") in {"symbol", "string"}:
            values.append(str(child["value"]))
    return values
