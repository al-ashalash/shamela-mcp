/**
 * The lexicon is the scholarship in this tool, so it is pinned like one.
 *
 * A formula added carelessly does not fail anything — it just quietly inflates
 * a column a researcher is reading as evidence. These check the properties
 * that make an entry admissible at all.
 */

import { describe, it, expect } from "vitest";

import {
    CONSENSUS_LEXICON,
    formulaByName,
    formulasFor,
} from "../../src/server/consensusLexicon.js";
import { MAX_QUERY_TOKENS } from "../../src/server/constants.js";

describe("every formula can actually be asked of the engine", () => {
    it("stays inside the five words the engine accepts", () => {
        // Past the fifth word Normalize.java glues the overflow into the fifth,
        // and the formula silently matches nothing at all.
        for (const f of CONSENSUS_LEXICON) {
            expect(f.formula.trim().split(/\s+/).length, f.formula).toBeLessThanOrEqual(MAX_QUERY_TOKENS);
        }
    });

    it("allows words inside a formula only where the formula is interrupted in practice", () => {
        for (const f of CONSENSUS_LEXICON) {
            if (f.formula.trim().split(/\s+/).length === 1) {
                expect(f.gap, `${f.formula} is one word and cannot be interrupted`).toBe(0);
            }
            expect(f.gap, f.formula).toBeLessThanOrEqual(3);
        }
    });
});

describe("what the lexicon deliberately excludes", () => {
    it("has no bare «خلاف»", () => {
        // It heads both «لا خلاف» and «فيه خلاف», so counting it counts each of
        // those twice, and it carries no polarity of its own.
        expect(CONSENSUS_LEXICON.map((f) => f.formula)).not.toContain("خلاف");
    });

    it("has no bare «خلافا»", () => {
        // «a disagreement» and «contrary to», in the same four letters.
        expect(CONSENSUS_LEXICON.map((f) => f.formula)).not.toContain("خلافا");
    });

    it("keeps both spellings of each dual, because the index does not stem", () => {
        for (const [a, b] of [
            ["قولان", "قولين"],
            ["روايتان", "روايتين"],
            ["وجهان", "وجهين"],
        ]) {
            expect(formulaByName(a), a).toBeDefined();
            expect(formulaByName(b), b).toBeDefined();
        }
    });
});

describe("the weaker entries are marked as weaker", () => {
    it("flags the ones whose count runs ahead of their evidence", () => {
        // «الإجماع» is the topic word — used as readily to deny a claimed ijmaa
        // as to assert one — and «اتفق»/«اختلف» carry unrelated senses.
        for (const name of ["الإجماع", "اتفق", "اختلف"]) {
            expect(formulaByName(name)?.caveat, name).toBeTruthy();
        }
    });

    it("leaves the unambiguous ones unflagged", () => {
        for (const name of ["أجمعوا", "لا خلاف", "روايتان", "فيه خلاف"]) {
            expect(formulaByName(name)?.caveat, name).toBeUndefined();
        }
    });

    it("records what each entry measured, so a later change can be compared", () => {
        for (const f of CONSENSUS_LEXICON) {
            expect(f.measured, f.formula).toBeGreaterThan(0);
        }
    });
});

describe("selecting a family", () => {
    it("returns the whole lexicon when no family is named", () => {
        expect(formulasFor()).toHaveLength(CONSENSUS_LEXICON.length);
        expect(formulasFor([])).toHaveLength(CONSENSUS_LEXICON.length);
    });

    it("returns one family alone when one is named", () => {
        const ijmaa = formulasFor(["ijmaa"]);
        expect(ijmaa.length).toBeGreaterThan(3);
        expect(ijmaa.every((f) => f.family === "ijmaa")).toBe(true);
        expect(formulasFor(["ijmaa"]).length + formulasFor(["khilaf"]).length).toBe(CONSENSUS_LEXICON.length);
    });

    it("carries both families, in useful numbers", () => {
        expect(formulasFor(["ijmaa"]).length).toBeGreaterThanOrEqual(8);
        expect(formulasFor(["khilaf"]).length).toBeGreaterThanOrEqual(8);
    });
});
