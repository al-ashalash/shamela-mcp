/**
 * shamela_scan_consensus — where a question is declared settled, and where it
 * is declared open.
 *
 * A researcher opening a question needs to know, before anything else, whether
 * it is disputed at all: an ijmaa claim ends the inquiry, two riwayat begin it.
 * Finding that out by ordinary search means running a dozen searches by hand —
 * «أجمعوا» with the subject, «لا خلاف» with the subject, «روايتان» with the
 * subject — and then holding a dozen result sets in one's head. This runs them
 * as one sweep and returns a table.
 *
 * WHAT IT DOES NOT DO is decide. There is no verdict field, no «disputed:
 * true», no total of the agreement column against the disagreement column, and
 * the omissions are deliberate:
 *
 *   - Negation and attribution are invisible to an index. «لا إجماع في
 *     المسألة», «ادعى الإجماع وليس كذلك» and «قيل لا خلاف» all carry the
 *     formula and none of them asserts it. Only reading the page settles that,
 *     which is why every formula ships with witnesses and why the count is
 *     described as a place to look.
 *   - The counts are dominated by house idiom, not by dispute. Measured across
 *     the four schools on this install: «وجهان» is 32,334 pages of Shafii fiqh
 *     and 198 of Maliki; «روايتان» is 6,950 Hanbali and 781 Shafii. A raw
 *     cross-school comparison measures how a school WRITES, so each formula's
 *     own total in the same scope is reported beside its count.
 *   - Pages cannot be added across formulas. A page saying «لا خلاف» and
 *     «بالإجماع» is one page; the rollups give book ids, not page ids, so the
 *     only honest family-level total is how many BOOKS were touched.
 *
 * It runs on `search_near_groups`, which exists because `mode:'near'` could not
 * express this: it puts every word in one unordered window, so «لا خلاف» was
 * never required to be adjacent. Measured before the engine command was added:
 * of the first sixty pages returned for «لا خلاف» near «المسح», not one
 * contained «لا خلاف» — and among them sat pages recording the disagreement the
 * formula denies. The tool would have inverted its own findings.
 */

import { z } from "zod";

import { CatalogScope, MADHHAB_CATEGORY, type Catalog } from "../catalog.js";
import { CONSENSUS_LEXICON, formulaByName, formulasFor, type ConsensusFamily, type ConsensusFormula } from "../consensusLexicon.js";
import { badArg, emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { scanConsensusLabels } from "../i18n/tools/scanConsensus.js";

export const scanConsensusInputShape = {
    question: z
        .string()
        .min(2)
        .describe(
            "The subject whose dispute is being located — «المسح على الخفين», «الاستصناع», «بيع الوفاء». One to three words; it is required NEAR each formula, not merely on the same page.",
        ),
    families: z
        .array(z.enum(["ijmaa", "khilaf"]))
        .optional()
        .describe("Limit to the agreement formulas ('ijmaa') or the disagreement formulas ('khilaf'). Default: both."),
    formulas: z
        .array(z.string())
        .optional()
        .describe("Run only these formulas, written exactly as the lexicon has them («لا خلاف», «روايتان»). Overrides `families`. Fewer formulas, faster sweep."),
    distance: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(15)
        .describe("Words allowed between the formula and the subject (1–50, default 15). Wider finds more and means less."),
    search_in: z
        .array(z.enum(["body", "foot", "comment"]))
        .default(["body"])
        .describe(
            "Default is the matn alone. A formula in an editor's footnote is the editor declaring the consensus, not the author — a different kind of evidence, so 'foot' is opt-in.",
        ),
    witnesses: z
        .number()
        .int()
        .min(0)
        .max(5)
        .default(2)
        .describe("Pages to quote per formula (0–5, default 2). The witnesses are the evidence; the counts are only where to look."),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe("Restrict to books/authors/categories/madhhab/period. A madhhab scope answers 'where does THIS school locate the dispute'."),
    ...ResponseFormatInput,
};
export const scanConsensusInput = z.object(scanConsensusInputShape).strict();

interface RawHit {
    book_id: number;
    page_id: number;
    snippet_body: string;
    snippet_foot: string;
}
interface RawEnvelope {
    normalized_groups: string[][];
    dropped_tokens?: string[];
    group_totals: number[];
    total_hits: number;
    coverage?: { by_book_key: Record<string, number>; basis?: string; at_cap?: boolean };
    results: RawHit[];
}

export interface ConsensusWitness {
    book_id: number;
    book_name: string;
    author_name: string | null;
    category: string | null;
    page_id: number;
    printed_page: string | null;
    /** True when the formula was found in the editor's footnote, not the matn. */
    in_footnote: boolean;
    snippet: string;
    source_url: string;
}

export interface ConsensusRow {
    formula: string;
    family: ConsensusFamily;
    /** Words tolerated inside the formula; 0 means it was required adjacent. */
    gap: number;
    /** Pages where the formula stands within `distance` of the subject. Exact. */
    pages: number;
    /**
     * Books those pages fall in. Exact when `coverage_basis` is
     * "all_results"; a sample of the fetched window when it is "window".
     */
    books: number;
    /**
     * Whether `books` and `by_madhhab` describe every matching page or only
     * the fetched window. `pages` is exact either way (it is a count, not a
     * walk); the distribution is what the engine may abandon under its time
     * budget, and a walk it abandoned must not be read as one it finished.
     */
    coverage_basis: "all_results" | "window";
    /**
     * The formula's OWN total in the same scope, whatever the subject.
     *
     * The base rate, without which a cross-school comparison measures idiom:
     * «وجهان» is a Shafii habit and «روايتان» a Hanbali one, and a school that
     * writes neither is not thereby a school without disagreements.
     */
    formula_pages_in_scope: number;
    /** Share of the subject's own pages that carry this formula near it. */
    share_of_subject: number;
    /** Set when this formula is weaker evidence than its count suggests. */
    caveat?: string;
    /**
     * How the pages fall across the four schools, free from the same rollup.
     *
     * These do NOT add up to `pages`: Shamela files each school's fiqh under
     * its own category, and general fiqh, usul and fatwa are outside all four
     * — deliberately, so a comparison of schools never silently absorbs them.
     */
    by_madhhab: Record<string, number>;
    witnesses: ConsensusWitness[];
}

export interface ScanConsensusOutput {
    question: string;
    distance: number;
    /** Pages carrying the subject at all, in this scope: the denominator. */
    subject_pages: number;
    searched: { books: number; downloaded_total: number; scoped: boolean };
    formulas: ConsensusRow[];
    /**
     * Per family, the number of BOOKS touched — never a page total. A page
     * carrying two formulas is one page, and the rollups cannot tell us so.
     */
    families: Record<ConsensusFamily, { books_touched: number; formulas_present: number }>;
    /** What the numbers are and are not. Always present. */
    reading_note: string;
    caveats: string[];
    suggestions?: string[];
}

const MADHHAB_OF_CATEGORY = new Map<number, string>(
    Object.entries(MADHHAB_CATEGORY).map(([name, id]) => [id, name]),
);

export async function runScanConsensus(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof scanConsensusInput>,
): Promise<RenderedResponse<ScanConsensusOutput>> {
    let selected: ConsensusFormula[];
    if (args.formulas?.length) {
        const unknown = args.formulas.filter((f) => !formulaByName(f));
        if (unknown.length) {
            throw badArg(
                `Not in the consensus lexicon: ${unknown.join(", ")}. The formulas are: ${CONSENSUS_LEXICON.map((f) => f.formula).join(", ")}`,
            );
        }
        selected = args.formulas.map((f) => formulaByName(f)!);
    } else {
        selected = formulasFor(args.families as ConsensusFamily[] | undefined);
    }

    let scopeBookKeys: string[] | null = null;
    let searchedBooks = catalog.downloadedBookIds().size;
    if (args.scope) {
        const scopeInput: ScopeInputType = {
            ...(args.scope as ScopeInputType),
            downloaded_only: args.scope?.downloaded_only ?? false,
        };
        const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
        if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
        scopeBookKeys = resolved.book_ids.map(String);
        searchedBooks = resolved.book_ids.length;
    }

    const L = pick(scanConsensusLabels);
    const caveats: string[] = [];
    let subjectPages = 0;
    const rows: ConsensusRow[] = [];
    const booksByFamily: Record<ConsensusFamily, Set<number>> = { ijmaa: new Set(), khilaf: new Set() };

    for (const entry of selected) {
        // The formula FIRST: it is the group the witness snippet opens on.
        const raw = await helper.request<RawEnvelope>("search_near_groups", {
            groups: [entry.formula, args.question],
            group_gaps: [entry.gap, 0],
            distance: args.distance,
            scope_book_keys: scopeBookKeys,
            max_results: args.witnesses,
            offset: 0,
            options: { search_in: args.search_in },
        });

        // The engine takes five words per group and drops the rest. For an
        // ordinary search that is a widening the caller can see; for a SCAN it
        // is not, because the dropped word is usually the one that named the
        // question, and every row would then read as a silence.
        if (raw.dropped_tokens?.length) {
            throw badArg(
                `The subject is too long for the engine, which takes five words per group: it dropped ${raw.dropped_tokens.join(", ")}. In a scan that is not a widening — every formula's row would then be about a different question. Use the one or two words that name it.`,
            );
        }
        // Both totals come back with the search: the formula's own reach in this
        // scope, and the subject's. Neither costs a round trip.
        const formulaTotal = raw.group_totals?.[0] ?? 0;
        subjectPages = raw.group_totals?.[1] ?? subjectPages;

        const byBook = raw.coverage?.by_book_key ?? {};
        // The engine abandons the per-book walk under a time budget and then
        // reports the fetched window instead — which for this tool is at most
        // five rows. researchScope guards this; a scan must too, or a formula
        // on twenty thousand pages arrives with «books: 1» presented as exact.
        const basis: "all_results" | "window" =
            raw.coverage?.basis === "window" || raw.coverage?.at_cap ? "window" : "all_results";
        const byMadhhab: Record<string, number> = {};
        for (const [key, count] of Object.entries(byBook)) {
            const rec = catalog.bookRecord(Number(key));
            const school = rec?.book_category != null ? MADHHAB_OF_CATEGORY.get(rec.book_category) : undefined;
            if (school) byMadhhab[school] = (byMadhhab[school] ?? 0) + count;
        }
        if (raw.total_hits > 0 && basis === "all_results") {
            // A windowed rollup contributes nothing to the family union: two
            // books out of thousands would read as «the family touched two».
            for (const key of Object.keys(byBook)) booksByFamily[entry.family].add(Number(key));
        }

        const witnesses: ConsensusWitness[] = [];
        // The engine fetches at least one row however small max_results is, so
        // witnesses:0 must be enforced here — a caller who asked for counts
        // alone gets counts alone, as the input schema promises.
        for (const hit of raw.results.slice(0, args.witnesses)) {
            const rec = catalog.bookRecord(hit.book_id);
            const inFootnote = !hit.snippet_body && Boolean(hit.snippet_foot);
            witnesses.push({
                book_id: hit.book_id,
                book_name: rec?.book_name ?? `(unknown ${hit.book_id})`,
                author_name: rec ? catalog.mainAuthorName(rec) : null,
                category: rec ? catalog.categoryPath(rec.book_category)[0] ?? null : null,
                page_id: hit.page_id,
                printed_page: await pages.printedPage(hit.book_id, hit.page_id),
                in_footnote: inFootnote,
                snippet: (hit.snippet_body || hit.snippet_foot || "").trim(),
                source_url: `https://shamela.ws/book/${hit.book_id}/${hit.page_id}`,
            });
        }

        rows.push({
            formula: entry.formula,
            family: entry.family,
            gap: entry.gap,
            pages: raw.total_hits,
            books: Object.keys(byBook).length,
            coverage_basis: basis,
            formula_pages_in_scope: formulaTotal,
            share_of_subject: subjectPages > 0 ? Math.round((raw.total_hits / subjectPages) * 1000) / 1000 : 0,
            ...(entry.caveat ? { caveat: L.formulaCaveat[entry.caveat] } : {}),
            by_madhhab: byMadhhab,
            witnesses,
        });
    }

    rows.sort((a, b) => b.pages - a.pages || a.formula.localeCompare(b.formula));
    if (rows.some((r) => r.coverage_basis === "window")) caveats.push(L.caveats.windowed);
    if (rows.some((r) => r.caveat)) caveats.push(L.caveats.flagged);
    if (args.search_in.includes("foot")) caveats.push(L.caveats.footnotes);
    if (rows.every((r) => r.pages === 0)) caveats.push(L.caveats.nothingAtAll);

    const out: ScanConsensusOutput = {
        question: args.question,
        distance: args.distance,
        subject_pages: subjectPages,
        searched: {
            books: searchedBooks,
            downloaded_total: catalog.downloadedBookIds().size,
            scoped: scopeBookKeys !== null,
        },
        formulas: rows,
        families: {
            ijmaa: {
                books_touched: booksByFamily.ijmaa.size,
                formulas_present: rows.filter((r) => r.family === "ijmaa" && r.pages > 0).length,
            },
            khilaf: {
                books_touched: booksByFamily.khilaf.size,
                formulas_present: rows.filter((r) => r.family === "khilaf" && r.pages > 0).length,
            },
        },
        reading_note: L.readingNote,
        caveats,
        ...(rows.every((r) => r.pages === 0) ? { suggestions: L.suggestions } : {}),
    };

    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, L.heading(data.question))];
        lines.push(L.subjectLine(num(data.subject_pages), num(data.searched.books), data.searched.scoped));
        lines.push("", `> *${data.reading_note}*`);
        for (const family of ["ijmaa", "khilaf"] as const) {
            const familyRows = data.formulas.filter((r) => r.family === family);
            if (!familyRows.length) continue;
            lines.push("", header(2, L.familyHeading[family]));
            lines.push(
                L.familyTotal(
                    num(data.families[family].formulas_present),
                    num(familyRows.length),
                    num(data.families[family].books_touched),
                ),
            );
            lines.push("", L.tableHead, L.tableRule);
            for (const r of familyRows) {
                const schools = (["hanafi", "maliki", "shafii", "hanbali"] as const)
                    .filter((m) => r.by_madhhab[m])
                    .map((m) => `${L.madhhab[m]} ${num(r.by_madhhab[m]!)}`)
                    .join(" · ");
                const windowed = r.coverage_basis === "window" ? "~" : "";
                lines.push(
                    `| ${r.formula}${r.caveat ? " ⚠️" : ""} | ${num(r.pages)} | ${windowed}${num(r.books)} | ${num(r.formula_pages_in_scope)} | ${windowed}${schools || "—"} |`,
                );
            }
            if (familyRows.some((r) => Object.keys(r.by_madhhab).length)) {
                lines.push("", `*${L.madhhabNote}*`);
            }
        }
        const shown = data.formulas.filter((r) => r.witnesses.length);
        if (shown.length) {
            lines.push("", header(2, L.witnessHeading));
            for (const r of shown) {
                lines.push("", `**${r.formula}** — ${num(r.pages)}`);
                for (const w of r.witnesses) {
                    lines.push(
                        `- ${w.book_name}${w.author_name ? L.byAuthor(w.author_name) : ""} — page_id=${String(w.page_id)}${w.printed_page ? L.printedPage(num(w.printed_page)) : ""}${w.in_footnote ? L.footnoteTag : ""}`,
                    );
                    if (w.snippet) lines.push(`  > ${w.snippet}`);
                }
            }
        }
        if (data.caveats.length) {
            lines.push("", header(2, L.caveatsHeading));
            for (const c of data.caveats) lines.push(`- ${c}`);
        }
        if (data.suggestions?.length) {
            lines.push("");
            for (const s of data.suggestions) lines.push(`- ${s}`);
        }
        return lines.join("\n");
    });
}
