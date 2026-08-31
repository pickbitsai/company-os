// Evidence-led portfolio GTM panel.
//
// The panel renders a small, generic contract. It does not research a market, infer an audience,
// score readiness, or take launch actions; those judgments belong to the portfolio's agent and
// owner. Keeping the renderer boring is what makes the strategy file reviewable.

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const id = "gtm";
export const title = "Portfolio GTM";
export const nav = "GTM";

const CONFIDENCE = new Set(["high", "medium", "low", "hypothesis"]);
const REQUIRED = ["id", "name", "lane", "audience", "hook", "route", "advanceWhen", "confidence"];
const TOP_LEVEL = new Set(["schemaVersion", "portfolio", "updatedAt", "portfolioCall", "products"]);
const PRODUCT_FIELDS = new Set([
  ...REQUIRED,
  "projectId",
  "status",
  "evidence",
  "risks",
  "owner",
  "updatedAt",
]);

function requireString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
}

function requireDateTime(value, path) {
  requireString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${path} must be an ISO date-time`);
  }
}

export function validatePortfolioGtm(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("GTM file must contain an object");
  for (const key of Object.keys(doc)) {
    if (!TOP_LEVEL.has(key)) throw new Error(`unknown top-level field "${key}"`);
  }
  if (!/\.portfolio-gtm\/v1$/.test(doc.schemaVersion || "")) {
    throw new Error("schemaVersion must end with .portfolio-gtm/v1");
  }
  if (doc.portfolio != null) requireString(doc.portfolio, "portfolio");
  requireDateTime(doc.updatedAt, "updatedAt");
  requireString(doc.portfolioCall, "portfolioCall");
  if (!Array.isArray(doc.products) || !doc.products.length) throw new Error("products must contain at least one strategy");

  const ids = new Set();
  for (const [index, product] of doc.products.entries()) {
    const at = `products[${index}]`;
    if (!product || typeof product !== "object" || Array.isArray(product)) throw new Error(`${at} must be an object`);
    for (const key of Object.keys(product)) {
      if (!PRODUCT_FIELDS.has(key)) throw new Error(`${at} has unknown field "${key}"`);
    }
    for (const field of REQUIRED) requireString(product[field], `${at}.${field}`);
    if (!/^[a-z0-9-]+$/.test(product.id)) throw new Error(`${at}.id must use lowercase kebab-case`);
    if (ids.has(product.id)) throw new Error(`duplicate product id "${product.id}"`);
    ids.add(product.id);
    if (product.projectId != null && !/^[a-z0-9-]+$/.test(product.projectId)) {
      throw new Error(`${at}.projectId must use lowercase kebab-case`);
    }
    if (!CONFIDENCE.has(product.confidence)) {
      throw new Error(`${at}.confidence must be high, medium, low, or hypothesis`);
    }
    if (!Array.isArray(product.evidence) || !product.evidence.length) {
      throw new Error(`${at}.evidence must contain at least one source or explicit evidence gap`);
    }
    for (const [evidenceIndex, evidence] of product.evidence.entries()) {
      requireString(evidence, `${at}.evidence[${evidenceIndex}]`);
    }
    for (const field of ["status", "owner"]) {
      if (product[field] != null) requireString(product[field], `${at}.${field}`);
    }
    if (product.updatedAt != null) requireDateTime(product.updatedAt, `${at}.updatedAt`);
    if (product.risks != null) {
      if (!Array.isArray(product.risks)) throw new Error(`${at}.risks must be an array`);
      for (const [riskIndex, risk] of product.risks.entries()) {
        requireString(risk, `${at}.risks[${riskIndex}]`);
      }
    }
  }
  return doc;
}

export function collect({ config, manifest, settings = {} }) {
  const configured = settings.file || "./portfolio-gtm.json";
  const file = isAbsolute(configured) ? configured : resolve(config.configDir, configured);
  const doc = validatePortfolioGtm(JSON.parse(readFileSync(file, "utf8")));
  const projectIds = new Set((manifest.engines || []).map((engine) => engine.id));
  const unknownProjects = doc.products
    .filter((product) => product.projectId && !projectIds.has(product.projectId))
    .map((product) => ({ id: product.projectId, product: product.name }));
  const lanes = {};
  for (const product of doc.products) lanes[product.lane] = (lanes[product.lane] || 0) + 1;
  const attention = doc.products.filter((product) => ["low", "hypothesis"].includes(product.confidence));
  return { ...doc, file, lanes, attention, unknownProjects };
}

export function stat(data) {
  return { label: "GTM strategies", value: data.products.length };
}

const confidenceClass = (confidence) => confidence === "high"
  ? "chip ok"
  : confidence === "medium"
    ? "chip"
    : "chip warn";

export function render(data, { esc }) {
  const laneChips = Object.entries(data.lanes)
    .map(([lane, count]) => `<span class="chip">${esc(lane)}: ${count}</span>`)
    .join("");
  const warnings = data.unknownProjects.length
    ? `<p class="doc"><span class="chip warn">${data.unknownProjects.length} unmatched project ID${data.unknownProjects.length === 1 ? "" : "s"}</span> ${data.unknownProjects.map((item) => `${esc(item.product)} → ${esc(item.id)}`).join(" · ")}</p>`
    : "";
  const rows = data.products.map((product) => {
    const evidence = product.evidence.map((item) => `<span class="mono">${esc(item)}</span>`).join("<br>");
    const risks = (product.risks || []).length
      ? `<br><span class="chip warn">${product.risks.length} risk${product.risks.length === 1 ? "" : "s"}</span> ${product.risks.map(esc).join(" · ")}`
      : "";
    return `<tr>
<td><b>${esc(product.name)}</b>${product.status ? `<br><span class="mono">${esc(product.status)}</span>` : ""}${product.projectId ? `<br><span class="mono">project: ${esc(product.projectId)}</span>` : ""}</td>
<td><span class="chip">${esc(product.lane)}</span></td>
<td class="doc">${esc(product.audience)}</td>
<td class="doc"><b>${esc(product.hook)}</b><br>${esc(product.route)}</td>
<td class="doc">${esc(product.advanceWhen)}</td>
<td><span class="${confidenceClass(product.confidence)}">${esc(product.confidence)}</span><br>${evidence}${risks}</td>
</tr>`;
  }).join("");

  return `<details class="ops-section" id="gtm"${data.attention.length || data.unknownProjects.length ? " open" : ""}><summary>${esc(title)} <span class="section-count">${data.products.length} strategies · ${data.attention.length} low-confidence</span></summary>
<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">
<p class="doc"><b>Portfolio call:</b> ${esc(data.portfolioCall)}</p>
<div class="chips">${laneChips}<span class="chip">updated ${esc(data.updatedAt)}</span></div>${warnings}</div>
<div class="table-shell"><table><tr><th>Product</th><th>Lane</th><th>Audience</th><th>Hook &amp; route</th><th>Advance when</th><th>Evidence</th></tr>${rows}</table></div></details>`;
}
