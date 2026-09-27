// Export the corpus as GBrain markdown pages: one file per note under its
// entity folder, with effective_date frontmatter so the contradiction judge
// sees the same dates the certifier's cache was built with.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { db, type Page } from "../src/store.ts";

const root = new URL("../brain/", import.meta.url).pathname;
const pages = db.query("SELECT * FROM pages ORDER BY slug").all() as Page[];
for (const p of pages) {
  const file = `${root}${p.slug}.md`;
  mkdirSync(dirname(file), { recursive: true });
  const fm = ["---", `title: ${JSON.stringify(p.title)}`, `entity: ${p.entity}`];
  if (p.effective_date) fm.push(`effective_date: ${p.effective_date}`);
  fm.push("---", "");
  writeFileSync(file, `${fm.join("\n")}# ${p.title}\n\n${p.text}\n`);
}
console.log(`wrote ${pages.length} pages to brain/`);
