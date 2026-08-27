/**
 * The formulas by which agreement and disagreement are DECLARED.
 *
 * Not a list of words about consensus — a list of the fixed idioms a faqih
 * writes when recording that a question is settled or that it is not. That
 * distinction is the whole design: «الإجماع» is a topic, «لا خلاف فيه» is a
 * claim, and only the second tells a reader where to look.
 *
 * Every entry below was counted against this install (1,111,817 indexed pages,
 * 8,598 catalogued books, 770 downloaded) before it was admitted, and the
 * counts are recorded because they are the argument for each entry's presence
 * and for the shape it takes. Three things they showed:
 *
 *   - The phrase constraint is not decoration. «خلاف» alone sits on 97,083
 *     pages; «لا خلاف» as an adjacent phrase on 9,002. The other 88,000 are
 *     «بخلاف», «على خلاف», «خلافا لأبي حنيفة» — including pages recording the
 *     very disagreement the formula denies.
 *   - The duals are two terms, not one. Shamela's index does not stem, so
 *     «قولان» (38,926) and «قولين» (16,954) are separate, and each carries a
 *     third to a half of the evidence. Both ship.
 *   - The interrupted forms carry more than the uninterrupted one. «لا نعلم
 *     خلافا» adjacent is 257 pages; allowing three words inside it reaches
 *     1,662 — «لا نعلم فيه خلافا», «لا نعلم بين أهل العلم خلافا». A strict
 *     phrase would have missed six sevenths of it.
 *
 * DELIBERATELY EXCLUDED, and why:
 *   «خلاف» bare — it is the head of both «لا خلاف» and «فيه خلاف», so counting
 *   it counts each of those twice and carries no polarity of its own.
 *   «خلافا» bare — it means both «a disagreement» and «contrary to», which are
 *   opposite polarities in the same four letters.
 *   Morphological matching on the root خلف — it would sweep in «خليفة» and
 *   «تخلف»; and the analyzer runs at about 0.80 on classical Arabic. These are
 *   surface idioms, not roots, and they must be matched as written.
 */

export type ConsensusFamily = "ijmaa" | "khilaf";

export interface ConsensusFormula {
    /** The idiom, as it is written. Also the key a caller selects it by. */
    formula: string;
    family: ConsensusFamily;
    /**
     * Words tolerated INSIDE the idiom. Zero is an adjacent phrase; three
     * admits «لا نعلم فيه خلافا» beside «لا نعلم خلافا» without admitting a
     * page that merely holds both words somewhere.
     */
    gap: number;
    /** Pages carrying it across this whole install, when it was admitted. */
    measured: number;
    /**
     * Set when the idiom is weaker evidence than its count suggests, and why.
     * Surfaced beside the number, because a flagged formula that dominates a
     * column is the likeliest way this tool could mislead.
     */
    caveat?: "also_other_senses" | "topic_not_claim";
}

export const CONSENSUS_LEXICON: ConsensusFormula[] = [
    // --- agreement ----------------------------------------------------------
    { formula: "أجمعوا", family: "ijmaa", gap: 0, measured: 4520 },
    { formula: "بالإجماع", family: "ijmaa", gap: 0, measured: 15497 },
    { formula: "بإجماع", family: "ijmaa", gap: 0, measured: 4821 },
    { formula: "بالاتفاق", family: "ijmaa", gap: 0, measured: 8281 },
    { formula: "اتفقوا", family: "ijmaa", gap: 0, measured: 4684 },
    { formula: "لا خلاف", family: "ijmaa", gap: 0, measured: 9002 },
    { formula: "بلا خلاف", family: "ijmaa", gap: 0, measured: 11399 },
    { formula: "لا نعلم خلافا", family: "ijmaa", gap: 3, measured: 1662 },
    {
        // Highest recall of the family and the least probative: it is equally
        // the word of the man DENYING a claimed ijmaa. Shipped because a
        // question's ijmaa literature is often unreachable without it.
        formula: "الإجماع",
        family: "ijmaa",
        gap: 0,
        measured: 21435,
        caveat: "topic_not_claim",
    },
    {
        // «اتفق» is also plain narrative — «اتفق أن…», "it happened that".
        // Kept because «اتفق … على» is the commonest Hanafi wording for
        // agreement, and losing it loses a school.
        formula: "اتفق",
        family: "ijmaa",
        gap: 0,
        measured: 10373,
        caveat: "also_other_senses",
    },

    // --- disagreement -------------------------------------------------------
    { formula: "اختلفوا", family: "khilaf", gap: 0, measured: 13867 },
    { formula: "فيه خلاف", family: "khilaf", gap: 0, measured: 4795 },
    { formula: "على قولين", family: "khilaf", gap: 0, measured: 10089 },
    { formula: "قولان", family: "khilaf", gap: 0, measured: 38926 },
    { formula: "قولين", family: "khilaf", gap: 0, measured: 16954 },
    { formula: "روايتان", family: "khilaf", gap: 0, measured: 13269 },
    { formula: "روايتين", family: "khilaf", gap: 0, measured: 6914 },
    { formula: "وجهان", family: "khilaf", gap: 0, measured: 48940 },
    { formula: "وجهين", family: "khilaf", gap: 0, measured: 28981 },
    {
        // The bare verb, which is also «اختلف إليه» (frequented him) and
        // «اختلف الليل والنهار». The plural above is the cleaner signal.
        formula: "اختلف",
        family: "khilaf",
        gap: 0,
        measured: 42427,
        caveat: "also_other_senses",
    },
];

/** Formulas of the given families, or the whole lexicon when none is named. */
export function formulasFor(families?: ConsensusFamily[]): ConsensusFormula[] {
    if (!families?.length) return CONSENSUS_LEXICON;
    return CONSENSUS_LEXICON.filter((f) => families.includes(f.family));
}

/** Look one up by the way it is written. */
export function formulaByName(name: string): ConsensusFormula | undefined {
    return CONSENSUS_LEXICON.find((f) => f.formula === name);
}
