// Shared prompt for writing a Plate infographic spec from GBrain notes, so the
// teacher (Muse Spark), the River-trained student and scripts/infographic.ts
// all see identical inputs.
import { infographicSpecSchema, type InfographicSpec } from "../../gmi-hackathon-infographic-agent/agent/lib/infographic.ts";
import type { Page } from "./store.ts";

export const SPEC_SHAPE = `Reply with ONE JSON object and nothing else, shaped exactly like:
{"format":"portrait","kicker":"ACCOUNT HEALTH","title":"2-5 words","accentWord":"one word from title","subtitle":"measure, scope, period",
 "chart":{"form":"column","data":[{"label":"Uptime","value":"93%","numeric":93}]},
 "callouts":[{"text":"true statement from the notes","anchor":"a data label"}],
 "style":{"preset":"clean_light"},"source":"Source: Northwind Robotics knowledge base","footnote":"one sentence"}
Rules: 4 to 6 data points, each a metric that appears in the notes (uptime, NPS, units deployed, revenue, headcount, price, contract status as a value like "Renewed" or "Not renewed").
Every printed string must come from the notes. At most 2 callouts.`;

export const notesBlock = (ps: Page[]) =>
  ps.map((p) => `[${p.slug.split("/").pop()} · ${p.effective_date ?? "undated"}] ${p.title}\n${p.text}`).join("\n\n");

export function specPrompt(pages: Page[], findings: string[] = []): string {
  return (
    `You design an infographic about one entity for an internal company newsletter.\n` +
    `Use ONLY these notes, oldest first:\n\n${notesBlock(pages)}\n\n` +
    (findings.length
      ? `The knowledge base's judge classified these note pairs (newer claims supersede older ones):\n${findings.join("\n")}\nValues must reflect the most recent notes.\n\n`
      : "") +
    SPEC_SHAPE
  );
}

/** Parse a model reply into a validated Plate spec (drops the optional download name). */
export function parseSpec(text: string): InfographicSpec {
  const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  delete raw.fileName;
  if (raw.chart?.unit === "optional") delete raw.chart.unit;
  return infographicSpecSchema.parse(raw);
}
