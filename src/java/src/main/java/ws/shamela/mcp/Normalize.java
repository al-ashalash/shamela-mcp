package ws.shamela.mcp;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Arabic normalization that reproduces Shamela's own analyzer.
 *
 * The Lucene indexes on disk were built by Shamela, and we never rebuild them,
 * so a query term only matches if we fold it exactly the way Shamela folded the
 * text at index time. A missing rule and an invented rule fail the same way: a
 * term that is not in the dictionary, hence a silent zero.
 *
 * Shamela's analyzer chains MappingCharFilters. Each is an independent pass:
 * left to right, longest key wins, and a pass never re-scans what it just
 * emitted — but its output feeds the next pass. That is why «شيء» ends up as
 * «شي» (P5 turns «يء» into «ئ», then P8 turns «ئ» into «ي») while a token that
 * only reaches P8 keeps its «ء». Merging the passes would change the result, so
 * do not merge them.
 *
 * Two deliberate deviations, both safe:
 *   - U+0670 (dagger alef) is dropped here; Shamela's LetterTokenizer instead
 *     treats it as a token break. No index term contains it, so dropping can
 *     only turn a query into a term that exists.
 *   - Token splitting itself is the caller's business; we normalize what we get.
 *
 * INVARIANT: every rule's replacement is at most as long as its key. Snippet
 * offsets are carried through the passes on that basis (see {@link #pass}).
 *
 * The TypeScript side (src/server/arabic.ts) carries the same table; the two are
 * asserted to agree in tests/integration/normalization.test.ts.
 */
public final class Normalize {

    private Normalize() {}

    /** Which index a text is being normalized for; they differ by one rule. */
    public enum Variant {
        /** page / title / book / author indexes. */
        PAGE,
        /** the `aya` index, which additionally maps «ائ» to «اا». */
        AYA
    }

    /** Maximum number of tokens we accept from a query (Shamela's default panel size). */
    public static final int MAX_TOKENS = 5;

    /** One or more whitespace characters. */
    private static final String SPLIT_WHITESPACE = "\\s+";

    /**
     * Marks removed before folding: Shamela's basic map (kashida and the
     * honorific ligatures) plus tashkeel and the Quranic annotation marks.
     */
    private static boolean isDropped(char c) {
        return (c >= 'ؐ' && c <= 'ؚ')
            || (c >= 'ً' && c <= 'ٟ')
            || c == 'ٰ'
            || (c >= 'ۖ' && c <= 'ۭ')
            || c == 'ـ'
            || (c >= '﵀' && c <= '﵏')
            || c == '﷏'
            || (c >= 'ﷺ' && c <= '﷿' && c != '﷼');
    }

    private static final String[][] P5 = {
        { "ءا", "ء" },
        { "يء", "ئ" },
    };

    /** AYA only. Applying this on the page path zeroes every word with «ائ». */
    private static final String[][] P6_AYA = {
        { "ائ", "اا" },
    };

    private static final String[][] P7 = {
        { "سماعيل", "سمعيل" },
        { "سماوات", "سموات" },
        { "اولائك", "اولئك" },
        { "براهام", "براهيم" },
        { "رحمان", "رحمن" },
        { "اسحاق", "اسحق" },
        { "هاذين", "هذين" },
        { "مائه", "مئه" },
        { "مائت", "مئت" },
        { "هاذا", "هذا" },
        { "ئو", "وو" },
        { "ءو", "وو" },
    };

    private static final String[][] P8 = {
        { "داوود", "داود" },
        { "طاووس", "طاوس" },
        { "ئ", "ي" },
    };

    private static final String[][] P9 = {
        { "سفرايين", "سفراين" },
    };

    /** A normalized string plus the map back to positions in the original. */
    public static record NormalizedHaystack(String normalized, int[] indexMap) {}

    /** Intermediate state between passes: text plus per-char source indexes. */
    private record Pass(String text, int[] map) {}

    /**
     * One MappingCharFilter-equivalent pass: at each position take the longest
     * matching key, emit its value, and continue after the match. Because every
     * replacement is no longer than its key, output char j can borrow the source
     * index of input char j — which is what keeps snippet offsets honest.
     */
    private static Pass pass(String s, int[] map, String[][] rules) {
        StringBuilder out = new StringBuilder(s.length());
        int[] om = new int[s.length()];
        int n = 0;
        int i = 0;
        while (i < s.length()) {
            String key = null;
            String val = null;
            for (String[] r : rules) {
                if (r[0].length() > (key == null ? 0 : key.length()) && s.startsWith(r[0], i)) {
                    key = r[0];
                    val = r[1];
                }
            }
            if (key == null) {
                out.append(s.charAt(i));
                om[n++] = map[i];
                i++;
                continue;
            }
            for (int j = 0; j < val.length(); j++) {
                out.append(val.charAt(j));
                om[n++] = map[i + j];
            }
            i += key.length();
        }
        return new Pass(out.toString(), Arrays.copyOf(om, n));
    }

    /** Character folding pass, then the ordered text passes. */
    private static NormalizedHaystack applyAll(String text, Variant variant) {
        int origLen = text.length();
        StringBuilder sb = new StringBuilder(origLen);
        int[] src = new int[origLen];
        int n = 0;
        for (int i = 0; i < origLen; i++) {
            char c = text.charAt(i);
            if (isDropped(c)) continue;
            char repl;
            switch (c) {
                case 'ٱ':
                case 'آ':
                case 'أ':
                case 'إ':
                    repl = 'ا';
                    break;
                case 'ى':
                    repl = 'ي';
                    break;
                case 'ؤ':
                    repl = 'و';
                    break;
                case 'ة':
                    repl = 'ه';
                    break;
                case 'گ':
                    repl = 'ك';
                    break;
                case 'پ':
                    repl = 'ب';
                    break;
                case 'چ':
                    repl = 'ج';
                    break;
                default:
                    // NOT folded, deliberately: a standalone ء (the index holds
                    // 15,205 terms containing it) and the Persian ک / ی, which
                    // Shamela's tables leave alone.
                    repl = c;
            }
            sb.append(repl);
            src[n++] = i;
        }
        Pass p = new Pass(sb.toString(), Arrays.copyOf(src, n));
        p = pass(p.text(), p.map(), P5);
        if (variant == Variant.AYA) p = pass(p.text(), p.map(), P6_AYA);
        p = pass(p.text(), p.map(), P7);
        p = pass(p.text(), p.map(), P8);
        p = pass(p.text(), p.map(), P9);
        int[] full = Arrays.copyOf(p.map(), p.map().length + 1);
        full[p.map().length] = origLen;
        return new NormalizedHaystack(p.text(), full);
    }

    /** Normalize a single token for the page indexes. */
    public static String normalizeToken(String token) {
        return normalizeToken(token, Variant.PAGE);
    }

    /** Normalize a single token. Returns the normalized form (may be empty). */
    public static String normalizeToken(String token, Variant variant) {
        if (token == null || token.isEmpty()) return "";
        String result = applyAll(token, variant).normalized().trim();
        // Synonym applied by Shamela's CustomAnalyzer when hamza is off: a whole
        // token of "ابن" becomes "بن". This is a token-level synonym, not a
        // character mapping — «ابناء» must not be touched.
        if ("ابن".equals(result)) return "بن";
        return result;
    }

    /**
     * A query as the engine will actually use it, beside the words it could not
     * take. `dropped` holds them AS TYPED, so a caller can name them back to
     * the person who wrote them.
     */
    public record QueryTokens(List<String> tokens, List<String> dropped) {}

    /** Split, normalize, and drop empty tokens. Caps at MAX_TOKENS. */
    public static List<String> normalizeQuery(String query) {
        return normalizeQuery(query, Variant.PAGE);
    }

    /** Split, normalize, and drop empty tokens. Caps at MAX_TOKENS. */
    public static List<String> normalizeQuery(String query, Variant variant) {
        return normalizeQueryDetailed(query, variant).tokens();
    }

    /**
     * The same, keeping what the cap left out.
     *
     * The overflow used to be JOINED onto the last accepted word — «باصل» and
     * «في» becoming the single token «باصل في» — on the reasoning that a user
     * would still get a sensible result. There is no such result: a term with a
     * space in it is in no index, so the whole conjunction was empty and the
     * search returned a confident zero, with no error and no warning. Measured
     * on this library: five words of a page's own sentence find that page, and
     * the same six find nothing at all.
     *
     * So the overflow is dropped instead. That searches for LESS than was asked
     * and can therefore only return too much — an answer a reader can see and
     * correct — and the dropped words are handed back so the answer can say
     * what was left out.
     *
     * The cap itself stays. Five is the width of Shamela's own search panel,
     * and matching it is what keeps these answers comparable to the program's.
     */
    public static QueryTokens normalizeQueryDetailed(String query, Variant variant) {
        if (query == null) return new QueryTokens(List.of(), List.of());
        String trimmed = query.trim();
        if (trimmed.isEmpty()) return new QueryTokens(List.of(), List.of());
        String[] raw = trimmed.split(SPLIT_WHITESPACE);
        List<String> input = new ArrayList<>(Arrays.asList(raw));
        List<String> dropped = List.of();
        if (input.size() > MAX_TOKENS) {
            dropped = List.copyOf(input.subList(MAX_TOKENS, input.size()));
            input = new ArrayList<>(input.subList(0, MAX_TOKENS));
        }
        List<String> out = new ArrayList<>(input.size());
        for (String tok : input) {
            String norm = normalizeToken(tok, variant);
            if (!norm.isEmpty()) out.add(norm);
        }
        return new QueryTokens(out, dropped);
    }

    /**
     * Normalize text into a parallel form, returning both the normalized chars
     * and an index map back to the original positions. Used by snippet
     * generation: find a match in the normalized version, then map indices back
     * to the original to slice the user-visible snippet.
     *
     * mapping[i] is the index in `text` corresponding to the i-th character of
     * the normalized output. mapping[normalized.length()] = text.length() so
     * `text.substring(mapping[start], mapping[end])` is safe.
     */
    public static NormalizedHaystack normalizeHaystack(String text) {
        return normalizeHaystack(text, Variant.PAGE);
    }

    /** As above, for the given index variant. */
    public static NormalizedHaystack normalizeHaystack(String text, Variant variant) {
        if (text == null) return new NormalizedHaystack("", new int[] { 0 });
        return applyAll(text, variant);
    }
}
