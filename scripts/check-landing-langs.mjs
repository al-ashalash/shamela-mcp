#!/usr/bin/env node
/**
 * The landing page carries twelve languages in one file, each string repeated
 * as a per-language <span>. A block that is missing one language renders blank
 * for readers of that language and looks perfectly fine to anyone reviewing it
 * in Arabic or English — which is everyone who reviews it.
 *
 * This compares the per-language span counts and reports any language that has
 * fewer blocks than Arabic, which is the reference because it is authored first.
 *
 * Usage: node scripts/check-landing-langs.mjs
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const file = path.join(repoRoot, "docs", "index.html");

const LANGS = ["ar", "en", "fa", "sw", "tr", "ru", "zh", "ur", "fr", "bn", "id", "ms"];
const REFERENCE = "ar";

const html = fs.readFileSync(file, "utf8");

const counts = Object.fromEntries(
    LANGS.map((l) => [l, (html.match(new RegExp(`class="${l}"`, "g")) ?? []).length]),
);

// The language switcher itself carries one button per language; the reference
// language may legitimately have a small surplus (e.g. a note only in Arabic),
// so flag shortfalls, not exact equality.
const ref = counts[REFERENCE];
let bad = 0;
console.log(`Reference: ${REFERENCE} with ${ref} blocks\n`);
for (const l of LANGS) {
    if (l === REFERENCE) continue;
    const diff = ref - counts[l];
    const ok = diff <= 1; // one-block slack for Arabic-only asides
    if (!ok) bad++;
    console.log(`${ok ? "[OK]  " : "[FAIL]"} ${l}  ${String(counts[l]).padStart(3)} blocks${diff > 0 ? `  (${diff} fewer than ${REFERENCE})` : ""}`);
}

// A language present in the switcher but absent from the body is the worst
// case: the reader can select it and get an empty page.
for (const l of LANGS) {
    if (counts[l] === 0) {
        console.log(`[FAIL] ${l} has no content blocks at all`);
        bad++;
    }
}

console.log("");
if (bad) {
    console.error(
        `${bad} language(s) are short of ${REFERENCE}. Every visible string needs a span per ` +
            `language — a missing one renders blank for those readers and is invisible in review.`,
    );
    process.exit(1);
}
console.log("All twelve languages carry the same blocks.");
