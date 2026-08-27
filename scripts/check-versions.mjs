#!/usr/bin/env node
/**
 * The version number lives in six places, and they drift.
 *
 * That is not hypothetical: the landing page and the README once kept
 * advertising 1.0.0 through two releases, and the server announced a version it
 * was not. Each of those was found by a person noticing, which is the part that
 * does not scale. This checks all six mechanically.
 *
 * The Arabic-numeral copies (README, landing page) are compared after mapping
 * Arabic-Indic digits, since those surfaces render the number in Arabic script.
 *
 * Usage: node scripts/check-versions.mjs
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

/** ١٫٢٫٠ → 1.2.0 (Arabic-Indic digits and the Arabic decimal separator). */
function toWesternDigits(s) {
    return s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/٫/g, ".");
}

const manifestVersion = readJson("manifest.json").version;
if (!manifestVersion) {
    console.error("manifest.json has no version — nothing to compare against");
    process.exit(1);
}

const sources = [];

sources.push({ where: "manifest.json", found: manifestVersion });
sources.push({ where: "package.json", found: readJson("package.json").version });

const constants = read("src/server/constants.ts");
sources.push({
    where: "src/server/constants.ts (VERSION)",
    found: constants.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1],
});

// README states the version in Arabic numerals on its intro line.
const readme = toWesternDigits(read("README.md"));
sources.push({
    where: "README.md (intro line)",
    found: readme.match(/إصدار\s*\*\*([\d.]+)\*\*/)?.[1],
});

// The landing page carries the number in exactly one place: a `.lat` badge.
// Only the LABEL beside it is translated, not the digits.
//
// An earlier check here hunted for "Version 1.3.0" inside each language block
// and counted the distinct results. The page has never had that shape, so it
// matched nothing every time — and an empty set is not one value, so it
// reported `MIXED: ` and failed, naming a disagreement among zero footers.
// A guard that fails for a reason that is not true teaches people to ignore it.
//
// What replaces it is cheaper and stricter: every version-shaped string on the
// page must be the manifest's. That is the check the badge fix actually needed
// — 2.0.0 sat in that badge through a rename and only the badge line saw it.
//
// It fails closed: mention some OTHER product's X.Y.Z on this page (a JDK, a
// Lucene build) and this trips. That is deliberate. Prefer wording it without
// a version to teaching the guard exceptions it cannot verify.
const landing = toWesternDigits(read("docs/index.html"));
const badge = landing.match(/<div class="mv"><span class="lat">([\d.]+)<\/span>/)?.[1];
sources.push({ where: "docs/index.html (version badge)", found: badge });

const strays = [...new Set([...landing.matchAll(/\b\d+\.\d+\.\d+\b/g)].map((m) => m[0]))].filter(
    (v) => v !== manifestVersion,
);
sources.push({
    where: "docs/index.html (no other version anywhere)",
    found: strays.length === 0 ? manifestVersion : `STALE: ${strays.join(", ")}`,
});

let bad = 0;
for (const s of sources) {
    const ok = s.found === manifestVersion;
    if (!ok) bad++;
    console.log(`${ok ? "[OK]  " : "[FAIL]"} ${s.where.padEnd(42)} ${s.found ?? "(not found)"}`);
}

console.log("");
if (bad) {
    console.error(
        `${bad} place(s) disagree with manifest.json (${manifestVersion}). ` +
            `Update them before tagging — a release that announces the wrong version has shipped before.`,
    );
    process.exit(1);
}
console.log(`All version references agree: ${manifestVersion}`);
