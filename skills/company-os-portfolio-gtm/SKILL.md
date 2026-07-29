---
name: company-os-portfolio-gtm
description: Create or refresh an evidence-led go-to-market plan for products or projects tracked by Company OS. Use when asked to define audiences, positioning, launch or validation lanes, routes to market, proof gates, portfolio priorities, or a GTM view in the Company OS dashboard.
---

# Operate portfolio GTM in Company OS

Create one decision system, not another strategy document. Keep detailed evidence with the projects
that own it, keep the compact portfolio record in `portfolio-gtm.json`, and let the Company OS GTM
panel render that record.

## Read the current truth

1. Find `company-os.config.mjs` and its manifest.
2. Read the manifest roles, ingress, egress, nodes, satellites, and configured `panels.gtm.file`.
3. Read an existing GTM file before changing it.
4. Inspect only active products that pass the paging test: if the product stopped working or lost
   demand, would the owner want Company OS to surface it?
5. For each selected product, read its README, agent instructions, status record, product catalog,
   analytics or playtest evidence, and existing campaign or asset receipts.
6. Treat conflicts as reconciliation work. Do not silently choose the most convenient source.

Do not turn every directory into a product. Experiments, archives, dependencies, and abandoned
prototypes remain out unless the owner deliberately promotes them.

## Make the portfolio call

State which products receive attention now and which explicitly wait. A build, passing test, live
URL, or completed asset proves availability—not demand, retention, accessibility, distribution
readiness, or willingness to pay.

For every product, write exactly one lean strategy:

- `audience`: the specific user or buyer being tested;
- `hook`: the player- or buyer-legible promise;
- `route`: the smallest credible path from attention to use, validation, or purchase;
- `advanceWhen`: observable evidence that changes the allocation decision;
- `lane`: a short operating state such as `lead`, `productize`, `validate`, `hold`, or `incubate`;
- `confidence`: `high`, `medium`, `low`, or `hypothesis`;
- `evidence`: source paths, URLs, receipts, or datasets supporting the call.

Prefer an evidence gate over a calendar deadline. Do not manufacture readiness scores, forecasts,
prices, audience claims, or market facts. Browse current primary sources when platform rules,
pricing, fees, or other time-sensitive claims materially affect the recommendation.

## Write the Company OS contract

Use `schemas/portfolio-gtm.schema.json` from the installed Company OS package. Default to
`portfolio-gtm.json` beside the Company OS config unless `panels.gtm.file` names another path.

Preserve existing records and supported fields. Reconcile older or unsupported fields explicitly
instead of silently dropping them. Keep current catalog status separate from dated audit evidence;
use `updatedAt` for the active portfolio call rather than rewriting historical receipts.

If the GTM panel is not configured and the user asked to track the plan in Company OS, add:

```js
panels: {
  gtm: { file: "./portfolio-gtm.json" },
}
```

Do not duplicate the full strategy in the Company OS manifest or every project status file. A
project status may receive one updated headline, a strategy-count metric, and a short activity
receipt when the portfolio call materially changes.

## Reuse the operating system

Before requesting new work, locate complementary capacity already represented in Company OS:
research, production, asset libraries, websites, communities, analytics, stores, and deployment
surfaces. Reference existing artifacts and their owners. Do not move production implementation into
the GTM control plane.

Queue only the smallest next task that can change a decision. Record the product, action, exit
criterion, evidence links, and authority. A plan or queued task does not authorize publishing,
advertising spend, pricing changes, store submission, outreach, live-product edits, or external
state changes.

## Validate and hand off

1. Validate the JSON against `schemas/portfolio-gtm.schema.json`.
2. Confirm every product has all four strategy fields and at least one evidence entry or an explicit
   hypothesis-level evidence gap.
3. Run the configured Company OS build.
4. Confirm the GTM panel count, product names, lanes, strategy text, and evidence references in
   generated HTML.
5. Report the portfolio call, the system-of-record path, unresolved evidence gaps, and tests run.
