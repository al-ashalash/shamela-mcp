/**
 * Two ways a translated interface rots, neither of which a type checker sees.
 *
 * The first: a label copied instead of translated, so an English reader gets an
 * Arabic word in an English sentence. The second, and the likelier one: someone
 * adds a line to a renderer months from now and writes the Arabic inline,
 * because that is what the file used to look like. Then Arabic works, English
 * silently does not, and nothing fails.
 *
 * Both are checked against the source rather than against rendered output,
 * because rendering every tool needs a Shamela install and a JVM, and a guard
 * that only runs on one machine is a guard that stops running.
 */
import { describe, it, expect } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../src/server");
const TOOLS = path.join(SRC, "tools");
const SLICES = path.join(SRC, "i18n/tools");

const ARABIC = /[؀-ۿ]/;

const sliceFiles = fs.readdirSync(SLICES).filter((f) => f.endsWith(".ts"));
const toolFiles = fs.readdirSync(TOOLS).filter((f) => f.endsWith(".ts"));

/**
 * The `en` half of a slice, as text.
 *
 * Sliced between `en: {` and the end of the object, so Arabic on the `ar` side
 * — which is where it belongs — cannot be mistaken for a leftover.
 */
function englishHalf(src: string): string {
    const i = src.indexOf("en: {");
    return i < 0 ? "" : src.slice(i);
}

/**
 * Lines of a renderer that would show Arabic to a user.
 *
 * Deliberately ignores: comments (Arabic in a comment harms nobody), zod
 * `.describe()` and tool descriptions (read by the model, English by
 * convention), and the guide tool's section names (a declared input whose
 * values are Arabic on purpose — see src/server/guide.ts).
 */
/** Net parenthesis balance of a line — how much deeper it leaves you. */
function depthDelta(line: string): number {
    let d = 0;
    for (const c of line) {
        if (c === "(") d++;
        else if (c === ")") d--;
    }
    return d;
}

function offendingLines(src: string, file: string): string[] {
    const out: string[] = [];
    const lines = src.split(/\r?\n/);
    let inBlockComment = false;
    let inDescribe = false;
    let describeDepth = 0;
    // A marker exempts the statements that follow it, until the next blank line
    // separates it from unrelated code.
    let inDataBlock = false;
    for (const [i, raw] of lines.entries()) {
        const line = raw.trim();
        if (line.includes("i18n:arabic-data")) {
            inDataBlock = true;
            continue;
        }
        if (inDataBlock && line === "") inDataBlock = false;
        if (inBlockComment) {
            if (line.includes("*/")) inBlockComment = false;
            continue;
        }
        if (line.startsWith("/*")) {
            if (!line.includes("*/")) inBlockComment = true;
            continue;
        }
        if (line.startsWith("//") || line.startsWith("*")) continue;
        // A .describe(...) argument routinely spans several lines, and its
        // Arabic is examples for the model rather than wording for a reader.
        // Tracked by bracket depth: "does this line close it" was wrong for
        // every description containing a parenthesis of its own.
        if (inDescribe) {
            describeDepth += depthDelta(line);
            if (describeDepth <= 0) inDescribe = false;
            continue;
        }
        if (line.includes(".describe(")) {
            describeDepth = depthDelta(line.slice(line.indexOf(".describe(") + ".describe".length));
            inDescribe = describeDepth > 0;
            continue;
        }
        if (!ARABIC.test(line)) continue;
        if (file === "guide.ts") continue; // its Arabic is the declared input values
        if (line.includes("PROBE_QUERY")) continue; // an Arabic search term, not a label
        // Some Arabic in a tool is the alphabet it works ON, not wording it
        // shows: normalisation tables, the patterns that read an editor's name
        // out of a book title, the definite article tested for in code.
        // Translating any of it breaks behaviour instead of localising it.
        //
        // Such a block must SAY so. A marker comment above it is the whole
        // exemption — deliberately, rather than the guard guessing from the
        // shape of the line, because a guard that guesses will one day guess
        // wrong about a real label and stay quiet about it.
        if (inDataBlock) continue;
        out.push(`${file}:${i + 1}  ${line.slice(0, 100)}`);
    }
    return out;
}

describe("tool label slices", () => {
    it("every slice carries both languages", () => {
        expect(sliceFiles.length).toBeGreaterThan(25);
        for (const f of sliceFiles) {
            const src = fs.readFileSync(path.join(SLICES, f), "utf8");
            expect(src, `${f} has no ar side`).toContain("ar: {");
            expect(src, `${f} has no en side`).toContain("en: {");
            expect(src, `${f} does not use Slice<>`).toContain("Slice<");
        }
    });

    it("the Arabic side is Arabic", () => {
        for (const f of sliceFiles) {
            const src = fs.readFileSync(path.join(SLICES, f), "utf8");
            const arHalf = src.slice(src.indexOf("ar: {"), src.indexOf("en: {"));
            expect(ARABIC.test(arHalf), `${f}: ar side has no Arabic at all`).toBe(true);
        }
    });

    it("no English label was left in Arabic", () => {
        const leftovers: string[] = [];
        for (const f of sliceFiles) {
            const lines = englishHalf(fs.readFileSync(path.join(SLICES, f), "utf8")).split(/\r?\n/);
            for (const [i, line] of lines.entries()) {
                if (!ARABIC.test(line)) continue;
                const t = line.trim();
                // A comment may name the Arabic it is explaining — that is the
                // comment doing its job, not a label left untranslated.
                if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
                // An English sentence sometimes has to quote Arabic: advice to
                // drop the definite article «ال» cannot say which article it
                // means without printing it. Such a line must carry a marker
                // giving the reason, so the exception is a decision on the
                // record rather than a translation someone forgot.
                const marked = lines
                    .slice(Math.max(0, i - 3), i)
                    .some((prev) => prev.includes("i18n:arabic-intentional"));
                if (marked) continue;
                leftovers.push(`${f} (+${i}): ${t.slice(0, 100)}`);
            }
        }
        expect(leftovers, `untranslated labels:\n${leftovers.join("\n")}`).toEqual([]);
    });

    it("every slice is imported by the tool it belongs to", () => {
        // A slice nobody reads is a translation that does nothing, and it looks
        // exactly like one that works.
        for (const f of sliceFiles) {
            const tool = path.join(TOOLS, f);
            if (!fs.existsSync(tool)) continue;
            const src = fs.readFileSync(tool, "utf8");
            expect(src, `${f}: slice exists but the tool does not import it`).toContain(
                `../i18n/tools/${f.replace(/\.ts$/, ".js")}`,
            );
        }
    });

    it("a slice belonging to no single tool is still read by one", () => {
        // A shared slice has no tool of its own name, so the guard above skips
        // it — which is the one way a slice can exist, be translated, and reach
        // nobody at all.
        for (const f of sliceFiles) {
            if (fs.existsSync(path.join(TOOLS, f))) continue;
            const ref = `../i18n/tools/${f.replace(/\.ts$/, ".js")}`;
            const readers = toolFiles.filter((t) =>
                fs.readFileSync(path.join(TOOLS, t), "utf8").includes(ref),
            );
            expect(readers.length, `${f}: shared slice imported by no tool`).toBeGreaterThan(0);
        }
    });

    it("no identifier is rendered in Arabic-Indic digits", () => {
        // The rule is stated in src/server/i18n/labels.ts: a number the reader
        // types back has to come out the way they will type it. «٩٩٤٢» pasted
        // into a request resolves to nothing, and a reader has no way of knowing
        // that the id they were shown is not the id the tool wants.
        //
        // Matched by name, so it catches the shape the mistake actually takes —
        // num(x.page_id). A bare variable holding an id (num(k) inside a map)
        // slips through; that is a guard against the common case, not a proof.
        const IDS =
            /\bnum\(\s*[\w.?[\]]*\b(book_id|page_id|title_id|author_id|category_id|hadith_key)\b/;
        const offenders: string[] = [];
        for (const f of toolFiles) {
            const lines = fs.readFileSync(path.join(TOOLS, f), "utf8").split(/\r?\n/);
            for (const [i, raw] of lines.entries()) {
                const line = raw.trim();
                if (line.startsWith("//") || line.startsWith("*")) continue;
                if (IDS.test(line)) offenders.push(`${f}:${i + 1}  ${line.slice(0, 100)}`);
            }
        }
        expect(
            offenders,
            `identifiers arabized instead of printed as typed:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no renderer writes Arabic inline any more", () => {
        // The regression guard: this is what a future edit will get wrong.
        const offenders = toolFiles.flatMap((f) =>
            offendingLines(fs.readFileSync(path.join(TOOLS, f), "utf8"), f),
        );
        expect(
            offenders,
            `Arabic written inline instead of in a label slice:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });
});
