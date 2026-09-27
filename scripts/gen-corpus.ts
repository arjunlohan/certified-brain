// Generate a synthetic company brain: entities, each with dated notes that
// mix stable facts, updates, metric regressions, genuine conflicts, negations
// and unrelated aspects, so every GBrain verdict class occurs naturally.
import { chat, pool, teacher } from "../src/llm.ts";
import { db } from "../src/store.ts";

const N_ENTITIES = Number(process.env.N_ENTITIES ?? 60);
const ep = teacher();

const entityPrompt = `Invent a fictional B2B company, Northwind Robotics (warehouse robots, ~400 employees).
List ${N_ENTITIES} distinct entities from its internal knowledge base: roughly 20 people (with roles),
15 customer accounts, 10 internal projects, 8 vendors or partners, 7 products or policies.
Reply JSON: {"entities":[{"slug":"people/jane-doe","name":"Jane Doe","kind":"person","one_line":"..."}]}
Slugs use prefixes people/, customers/, projects/, vendors/, products/. No duplicates.`;

const notesPrompt = (e: { slug: string; name: string; kind: string; one_line: string }) =>
  `Write 6 short internal notes (2 to 4 sentences each) about "${e.name}" (${e.kind}: ${e.one_line})
from Northwind Robotics' knowledge base, as different employees would write them over 2025 to 2026.
Across the 6 notes include, naturally and without labeling them:
- at least one fact that later changes (a role, owner, status, price, or deadline update),
- at least one numeric metric that gets worse over time (revenue, headcount, uptime, NPS...),
- one pair of notes that genuinely disagree about the same fact at the same time,
- one note with an explicit negation ("we did NOT renew", "is not the owner"),
- other notes about unrelated aspects of the same entity.
Give most notes a date, but leave 1 or 2 undated.
Reply JSON: {"notes":[{"date":"2025-07-14" or null,"title":"...","text":"..."}]}`;

async function json<T>(prompt: string, maxTokens: number): Promise<T> {
  for (let i = 0; i < 3; i++) {
    const r = await chat(ep, prompt, { maxTokens, temperature: 0.8, json: true });
    try {
      return JSON.parse(r.text) as T;
    } catch {}
  }
  throw new Error("model did not return JSON");
}

const { entities } = await json<{ entities: any[] }>(entityPrompt, 6000);
console.log(`entities: ${entities.length}`);

const insert = db.query("INSERT OR REPLACE INTO pages (slug, entity, title, effective_date, text) VALUES (?,?,?,?,?)");
let pages = 0;
await pool(entities, 16, async (e) => {
  try {
    const { notes } = await json<{ notes: any[] }>(notesPrompt(e), 2500);
    notes.forEach((n, i) => {
      insert.run(`${e.slug}/note-${i + 1}`, e.slug, `${e.name}: ${n.title}`, n.date ?? null, n.text);
      pages++;
    });
  } catch (err) {
    console.error(`skip ${e.slug}: ${(err as Error).message}`);
  }
});
console.log(`pages: ${pages}`);
