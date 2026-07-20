/**
 * Builds a static, self-contained HTML review page for one eval fixture: the fixture
 * rendered via @weavensign/renderer-html-css, with a clickable overlay (keyed to the
 * same `node-<id>` element ids the renderer already emits) and a side panel for
 * reviewing/correcting each node's current label against ROLE_LABELS.
 *
 * Not part of build/test — run directly with `npx tsx eval/generate-review.ts <fixture>`.
 * Output goes to eval/review/<fixture>.html (gitignored — a local review artifact, not
 * source). The page's "Export corrections" button downloads a corrected labels JSON;
 * apply it back with `npx tsx eval/apply-review.ts <fixture> <path-to-exported-json>`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { renderDocument } from "@weavensign/renderer-html-css";
import { ROLE_LABELS, type RoleAssignment, type RoleLabel } from "@weavensign/normalization";
import type { DesignNode } from "@weavensign/schema";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));

interface ReviewRow {
  nodeId: string;
  type: DesignNode["type"];
  name: string;
  textPreview: string | undefined;
  width: number;
  height: number;
  currentRole: RoleLabel | undefined;
}

function loadFixture(fixtureName: string): DesignNode[] {
  const raw = readFileSync(path.join(EVAL_DIR, "fixtures", `${fixtureName}.json`), "utf-8");
  return JSON.parse(raw) as DesignNode[];
}

function loadLabels(fixtureName: string): Map<string, RoleLabel> {
  const raw = readFileSync(path.join(EVAL_DIR, "labels", `${fixtureName}.json`), "utf-8");
  const labels = JSON.parse(raw) as RoleAssignment[];
  return new Map(labels.map((label) => [label.nodeId, label.role]));
}

function textPreviewOf(node: DesignNode): string | undefined {
  if (node.type !== "text") {
    return undefined;
  }
  const joined = node.content.runs.map((run) => run.characters).join("");
  return joined.length > 60 ? `${joined.slice(0, 60)}…` : joined;
}

function childrenOf(node: DesignNode): DesignNode[] {
  switch (node.type) {
    case "frame":
    case "group":
    case "component":
    case "component-instance":
      return node.children;
    case "text":
    case "vector":
      return [];
  }
}

function collectRows(nodes: DesignNode[], labelsByNode: Map<string, RoleLabel>, out: ReviewRow[]): void {
  for (const node of nodes) {
    out.push({
      nodeId: node.id,
      type: node.type,
      name: node.name,
      textPreview: textPreviewOf(node),
      width: node.geometry.size.width,
      height: node.geometry.size.height,
      currentRole: labelsByNode.get(node.id),
    });
    collectRows(childrenOf(node), labelsByNode, out);
  }
}

function htmlNodeId(nodeId: string): string {
  return `node-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function buildReviewPage(fixtureName: string, documentHtml: string, rows: ReviewRow[]): string {
  const roleOptions = ROLE_LABELS.map((role) => `<option value="${role}">${role}</option>`).join("");
  const rowsJson = JSON.stringify(rows.map((row) => ({ ...row, htmlId: htmlNodeId(row.nodeId) })));
  const roleLabelsJson = JSON.stringify(ROLE_LABELS);

  // documentHtml is a full <!DOCTYPE html>...</html> document; embed it in an <iframe
  // srcdoc> so its own <style> rules never leak into / collide with the reviewer UI's.
  const escapedForSrcdoc = documentHtml.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Label review — ${fixtureName}</title>
<style>
  html, body { margin: 0; height: 100%; font-family: -apple-system, sans-serif; }
  #layout { display: flex; height: 100%; }
  #canvas-pane { flex: 1; overflow: auto; position: relative; background: #ddd; }
  #canvas-toolbar { position: sticky; top: 0; left: 0; z-index: 10; background: #f5f5f5; border-bottom: 1px solid #ccc; padding: 6px 10px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
  #zoom-stage { position: relative; transform-origin: top left; }
  #canvas-pane iframe { border: none; display: block; background: #fff; pointer-events: none; }
  #overlay { position: absolute; top: 0; left: 0; pointer-events: none; }
  .overlay-box { position: absolute; border: 1px solid rgba(255,0,0,0.35); pointer-events: auto; cursor: pointer; box-sizing: border-box; }
  .overlay-box:hover { border-color: red; background: rgba(255,0,0,0.08); }
  .overlay-box.selected { border-color: #0066ff; border-width: 2px; background: rgba(0,102,255,0.12); }
  .overlay-box.corrected { border-color: #16a34a; }
  #side-panel { width: 340px; border-left: 1px solid #ccc; padding: 12px; overflow-y: auto; font-size: 13px; }
  #side-panel h2 { font-size: 14px; margin: 0 0 8px; }
  #node-detail { border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 12px; }
  #node-detail div { margin-bottom: 4px; }
  #node-detail select { width: 100%; padding: 4px; margin-top: 4px; }
  #progress { margin-bottom: 10px; color: #555; }
  #export-btn { width: 100%; padding: 8px; margin-top: 10px; cursor: pointer; }
  .empty-hint { color: #888; }
  #node-list { list-style: none; padding: 0; margin: 0; }
  #node-list li { padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  #node-list li:hover { background: #f0f0f0; }
  #node-list li.corrected { color: #16a34a; font-weight: 600; }
</style>
</head>
<body>
<div id="layout">
  <div id="canvas-pane">
    <div id="canvas-toolbar">
      <button id="zoom-out">−</button>
      <input id="zoom-slider" type="range" min="10" max="300" value="100">
      <button id="zoom-in">+</button>
      <span id="zoom-label">100%</span>
      <button id="zoom-fit">Fit to view</button>
      <button id="zoom-100">100%</button>
    </div>
    <div id="zoom-stage">
      <iframe id="doc-frame" srcdoc="${escapedForSrcdoc}"></iframe>
      <div id="overlay"></div>
    </div>
  </div>
  <div id="side-panel">
    <h2>${fixtureName}</h2>
    <div id="progress"></div>
    <div id="node-detail"><div class="empty-hint">Click a box in the canvas, or a row below.</div></div>
    <button id="export-btn">Export corrections (JSON)</button>
    <h2 style="margin-top:16px">All nodes (${rows.length})</h2>
    <ul id="node-list"></ul>
  </div>
</div>
<script>
const ROWS = ${rowsJson};
const ROLE_LABELS = ${roleLabelsJson};
const corrections = new Map(); // nodeId -> role, only entries the reviewer actually changed/confirmed

const frame = document.getElementById("doc-frame");
const overlay = document.getElementById("overlay");
const detail = document.getElementById("node-detail");
const progress = document.getElementById("progress");
const list = document.getElementById("node-list");
const canvasPane = document.getElementById("canvas-pane");
const zoomStage = document.getElementById("zoom-stage");
const zoomSlider = document.getElementById("zoom-slider");
const zoomLabel = document.getElementById("zoom-label");
let selectedNodeId = null;
let docWidth = 0;
let docHeight = 0;

function setZoom(percent) {
  const clamped = Math.max(10, Math.min(300, percent));
  zoomStage.style.transform = "scale(" + (clamped / 100) + ")";
  zoomSlider.value = String(clamped);
  zoomLabel.textContent = Math.round(clamped) + "%";
}

document.getElementById("zoom-in").addEventListener("click", () => setZoom(Number(zoomSlider.value) + 10));
document.getElementById("zoom-out").addEventListener("click", () => setZoom(Number(zoomSlider.value) - 10));
document.getElementById("zoom-100").addEventListener("click", () => setZoom(100));
document.getElementById("zoom-fit").addEventListener("click", () => {
  if (!docWidth || !docHeight) return;
  const paneWidth = canvasPane.clientWidth - 24;
  const paneHeight = canvasPane.clientHeight - 48;
  const fitPercent = Math.min(paneWidth / docWidth, paneHeight / docHeight) * 100;
  setZoom(fitPercent);
});
zoomSlider.addEventListener("input", () => setZoom(Number(zoomSlider.value)));

function currentRoleFor(row) {
  return corrections.has(row.nodeId) ? corrections.get(row.nodeId) : row.currentRole;
}

function updateProgress() {
  progress.textContent = corrections.size + " / " + ROWS.length + " reviewed";
}

function renderNodeList() {
  list.innerHTML = "";
  for (const row of ROWS) {
    const li = document.createElement("li");
    const role = currentRoleFor(row);
    li.textContent = (role || "—") + "  ·  " + row.type + "  ·  " + (row.name || row.nodeId);
    li.dataset.nodeId = row.nodeId;
    if (corrections.has(row.nodeId)) li.classList.add("corrected");
    li.addEventListener("click", () => selectNode(row.nodeId));
    list.appendChild(li);
  }
}

function selectNode(nodeId) {
  selectedNodeId = nodeId;
  const row = ROWS.find((r) => r.nodeId === nodeId);
  document.querySelectorAll(".overlay-box").forEach((el) => el.classList.remove("selected"));
  const box = document.getElementById("box-" + row.htmlId);
  if (box) box.classList.add("selected");

  const role = currentRoleFor(row);
  detail.innerHTML =
    '<div><strong>' + row.type + '</strong> — ' + (row.name || '(unnamed)') + '</div>' +
    '<div>id: ' + row.nodeId + '</div>' +
    (row.textPreview ? '<div>text: "' + row.textPreview.replace(/</g, "&lt;") + '"</div>' : "") +
    '<div>size: ' + Math.round(row.width) + '×' + Math.round(row.height) + '</div>' +
    '<div>draft label: ' + (row.currentRole || '(none)') + '</div>' +
    '<label style="display:block;margin-top:8px">Reviewed role:' +
    '<select id="role-select"></select></label>';
  const select = document.getElementById("role-select");
  for (const r of ROLE_LABELS) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    if (r === role) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    corrections.set(row.nodeId, select.value);
    box?.classList.add("corrected");
    updateProgress();
    renderNodeList();
  });
}

function buildOverlay() {
  const doc = frame.contentDocument;
  docWidth = doc.documentElement.scrollWidth;
  docHeight = doc.documentElement.scrollHeight;
  overlay.style.width = docWidth + "px";
  overlay.style.height = docHeight + "px";
  frame.style.width = docWidth + "px";
  frame.style.height = docHeight + "px";

  // Coordinates are captured once, in the iframe's own unscaled pixel space (viewport rect
  // relative to the iframe's own root, unaffected by CSS zoom on the outer #zoom-stage) —
  // #zoom-stage's single transform scales the iframe and this overlay together, so boxes
  // never need recomputing when the zoom level changes.
  const rootRect = doc.documentElement.getBoundingClientRect();
  for (const row of ROWS) {
    const el = doc.getElementById(row.htmlId);
    if (!el) continue; // invisible node (visible: false), renderer skips it — nothing to overlay
    const rect = el.getBoundingClientRect();
    const box = document.createElement("div");
    box.className = "overlay-box";
    box.id = "box-" + row.htmlId;
    box.style.left = (rect.left - rootRect.left) + "px";
    box.style.top = (rect.top - rootRect.top) + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
    box.title = row.type + ": " + (row.name || row.nodeId);
    box.addEventListener("click", () => selectNode(row.nodeId));
    overlay.appendChild(box);
  }

  document.getElementById("zoom-fit").click();
}

frame.addEventListener("load", buildOverlay);

document.getElementById("export-btn").addEventListener("click", () => {
  const out = ROWS.map((row) => ({ nodeId: row.nodeId, role: currentRoleFor(row) })).filter((r) => r.role !== undefined);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "${fixtureName}.reviewed.json";
  a.click();
});

updateProgress();
renderNodeList();
</script>
</body>
</html>`;
}

function main(): void {
  const fixtureName = process.argv[2];
  if (!fixtureName) {
    console.error("Usage: npx tsx eval/generate-review.ts <fixture-name>");
    process.exit(1);
  }

  const roots = loadFixture(fixtureName);
  const labelsByNode = loadLabels(fixtureName);
  const rows: ReviewRow[] = [];
  collectRows(roots, labelsByNode, rows);

  const documentHtml = renderDocument(roots);
  const page = buildReviewPage(fixtureName, documentHtml, rows);

  const reviewDir = path.join(EVAL_DIR, "review");
  mkdirSync(reviewDir, { recursive: true });
  const outPath = path.join(reviewDir, `${fixtureName}.html`);
  writeFileSync(outPath, page, "utf-8");
  console.log(`Wrote ${outPath} (${rows.length} nodes)`);
}

main();
