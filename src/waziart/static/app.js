const vocabulary = { concepts: [], exhibition_theme: "peace" };
let currentReview = null;

const submitForm = document.querySelector("#submit-form");
const challengeForm = document.querySelector("#challenge-form");
const evidenceRows = document.querySelector("#evidence-rows");
const results = document.querySelector("#results");
const savedList = document.querySelector("#saved-list");
const savedEmpty = document.querySelector("#saved-empty");

document.querySelector("#sample-gap").addEventListener("click", () => fillSample({
  id: "paths-to-peace",
  title: "Paths to Peace",
  description: "Figures meet (and listen) beside a paper river.",
  theme: "peace",
  permission: "",
  concept: "reconciliation",
  note: "The boats meet in the middle of the corridor."
}));

document.querySelector("#sample-ready").addEventListener("click", () => fillSample({
  id: "paths-to-peace-ready",
  title: "Paths to Peace",
  description: "Figures meet (and listen) beside a paper river.",
  theme: "peace",
  permission: "confirmed",
  concept: "reconciliation",
  note: "The boats meet in the middle of the corridor."
}));

document.querySelector("#sample-dispute").addEventListener("click", () => fillSample({
  id: "disputed-memorial",
  title: "Disputed Memorial",
  description: "A shared wall lists names the two communities do not yet agree how to read.",
  theme: "peace",
  permission: "disputed",
  concept: "memorial",
  note: ""
}));

document.querySelector("#add-evidence").addEventListener("click", () => addEvidenceRow());
document.querySelector("#theme").addEventListener("change", syncThemeOther);
document.querySelectorAll('#challenge-form input[name="action"]').forEach((input) => {
  input.addEventListener("change", syncChallengeValue);
});
document.querySelector("#challenge-target").addEventListener("change", syncChallengeValue);
submitForm.addEventListener("submit", onSubmit);
challengeForm.addEventListener("submit", onChallenge);

start();

async function start() {
  try {
    const [health, vocab] = await Promise.all([getJSON("/api/health"), getJSON("/api/vocabulary")]);
    vocabulary.concepts = vocab.concepts;
    vocabulary.exhibition_theme = vocab.exhibition_theme;
    document.querySelector("#footer-status").textContent =
      `Hyperon ${health.hyperon}. Exhibition theme: ${health.exhibition_theme}. Storage: ${health.persistence}.`;
    addEvidenceRow("reconciliation", "");
    await refreshList();
  } catch (error) {
    document.querySelector("#footer-status").textContent = error.message;
  }
}

function fillSample(sample) {
  submitForm.elements.artwork_id.value = sample.id;
  submitForm.elements.title.value = sample.title;
  submitForm.elements.description.value = sample.description;
  submitForm.elements.theme.value = sample.theme;
  syncThemeOther();
  const permission = submitForm.querySelector(`input[name="permission"][value="${sample.permission}"]`);
  if (permission) permission.checked = true;
  evidenceRows.replaceChildren();
  addEvidenceRow(sample.concept, sample.note);
  hide(document.querySelector("#form-alert"));
  document.querySelector("#title").focus();
}

function syncThemeOther() {
  const other = document.querySelector("#theme-other-field");
  other.hidden = submitForm.elements.theme.value !== "other";
}

function addEvidenceRow(concept, note) {
  const row = document.createElement("div");
  row.className = "field";
  const conceptLabel = document.createElement("label");
  const conceptId = `concept-${Date.now()}-${evidenceRows.children.length}`;
  conceptLabel.setAttribute("for", conceptId);
  conceptLabel.textContent = "Evidence concept";
  const select = document.createElement("select");
  select.id = conceptId;
  select.className = "concept";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Not supplied";
  select.append(blank);
  vocabulary.concepts.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  });
  const other = document.createElement("option");
  other.value = "other";
  other.textContent = "Other token";
  select.append(other);
  const otherInput = document.createElement("input");
  otherInput.className = "concept-other";
  otherInput.placeholder = "other concept token";
  otherInput.hidden = true;
  otherInput.setAttribute("aria-label", "Other evidence concept");
  select.addEventListener("change", () => {
    otherInput.hidden = select.value !== "other";
  });
  if (concept && vocabulary.concepts.includes(concept)) {
    select.value = concept;
  } else if (concept) {
    select.value = "other";
    otherInput.hidden = false;
    otherInput.value = concept;
  }
  const noteLabel = document.createElement("label");
  const noteId = `${conceptId}-note`;
  noteLabel.setAttribute("for", noteId);
  noteLabel.textContent = "Note for this evidence";
  const noteInput = document.createElement("input");
  noteInput.id = noteId;
  noteInput.className = "note";
  noteInput.value = note || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove evidence";
  remove.addEventListener("click", () => {
    row.remove();
    if (!evidenceRows.children.length) addEvidenceRow();
  });
  row.append(conceptLabel, select, otherInput, noteLabel, noteInput, remove);
  evidenceRows.append(row);
}

async function onSubmit(event) {
  event.preventDefault();
  const alert = document.querySelector("#form-alert");
  hide(alert);
  const button = document.querySelector("#submit-button");
  button.disabled = true;
  button.textContent = "Asking MeTTa…";
  try {
    const review = await sendJSON("/api/artworks", payloadFromForm());
    await refreshList();
    renderReview(review, "#results-heading");
  } catch (error) {
    showAlert(alert, error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Submit for review";
  }
}

function payloadFromForm() {
  const themeChoice = submitForm.elements.theme.value;
  const theme = themeChoice === "other" ? document.querySelector("#theme-other").value : themeChoice;
  const permission = submitForm.querySelector('input[name="permission"]:checked').value;
  const evidence = [];
  evidenceRows.querySelectorAll(".field").forEach((row) => {
    const select = row.querySelector(".concept");
    const other = row.querySelector(".concept-other");
    const concept = select.value === "other" ? other.value : select.value;
    if (!concept) return;
    evidence.push({ concept, note: row.querySelector(".note").value });
  });
  return {
    artwork_id: submitForm.elements.artwork_id.value,
    title: submitForm.elements.title.value,
    description: submitForm.elements.description.value,
    theme,
    permission,
    evidence
  };
}

async function refreshList() {
  const data = await getJSON("/api/artworks");
  savedList.replaceChildren();
  savedEmpty.hidden = data.artworks.length > 0;
  data.artworks.forEach((artwork) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    const title = artwork.title || "(no title)";
    button.textContent = `${title} — ${artwork.artwork_id} — ${artwork.label} (${artwork.recommendation})`;
    button.addEventListener("click", () => openArtwork(artwork.artwork_id, button));
    item.append(button);
    savedList.append(item);
  });
}

async function openArtwork(id, button) {
  button.disabled = true;
  try {
    renderReview(await getJSON(`/api/artworks/${encodeURIComponent(id)}`), "#results-heading");
  } catch (error) {
    showAlert(document.querySelector("#form-alert"), error.message);
  } finally {
    button.disabled = false;
  }
}

function renderReview(review, focusSelector) {
  currentReview = review;
  results.hidden = false;
  const status = document.querySelector("#status-line");
  status.dataset.state = review.recommendation;
  status.textContent = `${review.label} (${review.recommendation}). ${review.status_note}`;
  document.querySelector("#disclaimer").textContent = review.disclaimer;

  const trace = document.querySelector("#trace");
  trace.replaceChildren();
  review.trace.forEach((item) => {
    const li = document.createElement("li");
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = item.kind;
    const summary = document.createElement("span");
    summary.textContent = ` ${item.summary}`;
    const code = document.createElement("div");
    code.className = "expr";
    code.textContent = item.expr;
    li.append(kind, summary, code);
    trace.append(li);
  });

  const facts = document.querySelector("#facts");
  facts.replaceChildren();
  if (!review.records.length) {
    const dt = document.createElement("dt");
    dt.textContent = "Facts";
    const dd = document.createElement("dd");
    dd.textContent = "No field has been supplied yet.";
    facts.append(dt, dd);
  }
  review.records.forEach((record) => {
    const dt = document.createElement("dt");
    dt.textContent = record.evidence_id ? `${record.role} ${record.evidence_id}` : record.role;
    const dd = document.createElement("dd");
    dd.textContent = String(record.value);
    facts.append(dt, dd);
  });

  const edges = document.querySelector("#edges");
  edges.replaceChildren();
  review.edges.forEach((edge) => {
    const row = document.createElement("tr");
    [edge.subject, edge.relation, edge.object, edge.expr].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    edges.append(row);
  });

  const changes = document.querySelector("#changes");
  changes.replaceChildren();
  if (!review.revisions.length) {
    const p = document.createElement("p");
    p.textContent = "No challenge has been recorded for this submission yet.";
    changes.append(p);
  }
  review.revisions.forEach((revision) => {
    const box = document.createElement("article");
    box.className = "change";
    const heading = document.createElement("h4");
    heading.textContent = revision.latest ? `${revision.revision_id} (latest)` : revision.revision_id;
    const p = document.createElement("p");
    p.textContent = revision.summary;
    const code = document.createElement("div");
    code.className = "expr";
    code.textContent = revision.expr;
    box.append(heading, p, code);
    changes.append(box);
  });

  fillChallengeTargets(review);
  hide(document.querySelector("#challenge-alert"));
  const focus = document.querySelector(focusSelector);
  if (focus) focus.focus();
}

function fillChallengeTargets(review) {
  const select = document.querySelector("#challenge-target");
  select.replaceChildren();
  const seen = new Set();
  const add = (value, label) => {
    if (seen.has(value)) return;
    seen.add(value);
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  };
  ["title", "description", "theme", "permission"].forEach((role) => {
    const record = review.records.find((item) => item.role === role);
    if (record) add(`${role}|${record.fact_id}`, `${role}: ${record.value}`);
    else add(`${role}|`, `${role} (not supplied yet)`);
  });
  review.records.filter((item) => item.role === "evidence").forEach((record) => {
    add(`evidence|${record.evidence_id}`, `evidence ${record.evidence_id}: ${record.value}`);
  });
  add("evidence|", "Add an evidence concept");
  syncChallengeValue();
}

function syncChallengeValue() {
  const action = challengeForm.querySelector('input[name="action"]:checked').value;
  const target = document.querySelector("#challenge-target").value || "permission|";
  const role = target.split("|")[0];
  const wrap = document.querySelector("#new-value-field");
  const input = document.querySelector("#new-value");
  const select = document.querySelector("#new-value-select");
  const label = document.querySelector("#new-value-label");
  if (action === "dispute") {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const useSelect = role === "permission" || role === "theme" || role === "evidence";
  input.hidden = useSelect;
  select.hidden = !useSelect;
  label.textContent = role === "evidence" ? "Corrected evidence concept" : `Corrected ${role}`;
  label.htmlFor = useSelect ? select.id : input.id;
  if (!useSelect) return;
  select.replaceChildren();
  const choices = role === "permission"
    ? ["confirmed", "missing", "disputed"]
    : role === "theme"
      ? [vocabulary.exhibition_theme]
      : vocabulary.concepts;
  choices.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  });
  if (role !== "permission") {
    const other = document.createElement("option");
    other.value = "other";
    other.textContent = "Other token";
    select.append(other);
  }
  select.onchange = () => {
    const otherToken = select.value === "other";
    input.hidden = !otherToken;
    if (otherToken) input.focus();
  };
}

async function onChallenge(event) {
  event.preventDefault();
  if (!currentReview) return;
  const alert = document.querySelector("#challenge-alert");
  hide(alert);
  const button = document.querySelector("#challenge-button");
  button.disabled = true;
  button.textContent = "Reassessing in MeTTa…";
  try {
    const target = document.querySelector("#challenge-target").value;
    const [role, extra] = target.split("|");
    const action = challengeForm.querySelector('input[name="action"]:checked').value;
    let value = "";
    if (action === "correct") {
      const select = document.querySelector("#new-value-select");
      if (!select.hidden && select.value === "other") {
        value = document.querySelector("#new-value").value;
        document.querySelector("#new-value").hidden = false;
      } else if (!select.hidden) {
        value = select.value;
      } else {
        value = document.querySelector("#new-value").value;
      }
      if (select.value === "other" && document.querySelector("#new-value").hidden) {
        document.querySelector("#new-value").hidden = false;
        document.querySelector("#new-value").focus();
        throw new Error("Enter the other token, then record the challenge again.");
      }
    }
    const review = await sendJSON(`/api/artworks/${encodeURIComponent(currentReview.artwork_id)}/challenges`, {
      role,
      action,
      value,
      evidence_id: role === "evidence" ? extra : "",
      note: document.querySelector("#challenge-note").value
    });
    await refreshList();
    renderReview(review, "#change-heading");
  } catch (error) {
    showAlert(alert, error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Record challenge and reassess";
  }
}

async function getJSON(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}

async function sendJSON(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}

function showAlert(node, message) {
  node.hidden = false;
  node.textContent = message;
  node.focus();
}

function hide(node) {
  node.hidden = true;
  node.textContent = "";
}
