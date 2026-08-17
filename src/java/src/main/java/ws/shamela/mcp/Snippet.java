package ws.shamela.mcp;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import ws.shamela.mcp.Normalize.NormalizedHaystack;

/**
 * Cheap snippet windowing: find any normalized token in the normalized version
 * of the field text, slice ±80 chars in the ORIGINAL text around the first
 * match, wrap matches in &lt;mark&gt;...&lt;/mark&gt;, and strip inline HTML
 * tags (Shamela's writer leaves &lt;span data-type="title"&gt; markers in
 * some pages). No Lucene Highlighter, by design — see docs/architecture.md
 * in the source repo.
 */
public final class Snippet {

    private Snippet() {}

    private static final int WINDOW = 80;

    /**
     * How far to look back for the tag a window may have opened inside.
     * Shamela's inline markers are short; a lone '<' in running text must not
     * cost a scan to the start of the page.
     */
    private static final int MAX_TAG_SCAN = 400;

    /** Part of a word, so a match touching one is not a whole-token match. */
    private static boolean isWordChar(char c) {
        return Character.isLetterOrDigit(c);
    }

    /**
     * Every WHOLE-TOKEN occurrence of `tok` in `norm`.
     *
     * The scan used to be a bare indexOf, which marked any substring. Searching
     * «شيء» (token «شي») produced «ال<mark>شي</mark>خ», «للزرك<mark>شي</mark>»
     * and «<mark>شي</mark>ئان» — and, worse, chose the WINDOW around the first
     * such fragment. On book 9879 page 327 the returned snippet_foot was
     * «انظر: المعتمد ١/٣٩٠، التبصرة لل<mark>شي</mark>رازي…» while the actual
     * match, «لتحريم شيءٍ جديدٍ», never appeared at all: the reader was shown a
     * bibliographic line about al-Shirazi as the evidence for a query about
     * شيء.
     *
     * Shamela's tokenizer splits on non-letters, so an index term IS a whole
     * word; requiring letter boundaries is what makes the highlight agree with
     * the thing the engine actually matched.
     *
     * A token carrying a wildcard is matched from its literal prefix and the
     * mark is extended to the end of the word, which is what the engine did to
     * find it.
     */
    private static void collectTokenMatches(String norm, String tok, List<int[]> into) {
        if (tok == null || tok.isEmpty()) return;
        int star = indexOfWildcard(tok);
        String needle = star < 0 ? tok : tok.substring(0, star);
        if (needle.isEmpty()) return;
        int from = 0;
        while (true) {
            int pos = norm.indexOf(needle, from);
            if (pos < 0) break;
            from = pos + needle.length();
            if (pos > 0 && isWordChar(norm.charAt(pos - 1))) continue; // mid-word
            int end = pos + needle.length();
            if (star < 0) {
                if (end < norm.length() && isWordChar(norm.charAt(end))) continue; // longer word
            } else {
                while (end < norm.length() && isWordChar(norm.charAt(end))) end++;
            }
            into.add(new int[] { pos, end });
        }
    }

    private static int indexOfWildcard(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '*' || c == '?') return i;
        }
        return -1;
    }

    /**
     * Pull a window edge out of the middle of an HTML tag.
     *
     * `stripHtmlKeepMarks` walks its slice assuming it starts outside a tag. A
     * window opening after a '<' but before its '>' therefore emitted the tag's
     * ATTRIBUTES as if they were the book's words, and swallowed the '>' that
     * would have ended it — which is where the stray «an» from a severed
     * «</span>» came from.
     *
     * The start moves back onto the '<' so the whole tag is present and gets
     * stripped; the end moves back before a '<' whose tag the window does not
     * contain.
     */
    private static boolean insideTag(String text, int at) {
        for (int i = at - 1; i >= 0 && at - i <= MAX_TAG_SCAN; i--) {
            char c = text.charAt(i);
            if (c == '>') return false;
            if (c == '<') return true;
        }
        return false;
    }

    private static int snapStart(String text, int start) {
        if (start <= 0 || !insideTag(text, start)) return start;
        for (int i = start - 1; i >= 0 && start - i <= MAX_TAG_SCAN; i--) {
            if (text.charAt(i) == '<') return i;
        }
        return start;
    }

    private static int snapEnd(String text, int start, int end) {
        if (end >= text.length() || !insideTag(text, end)) return end;
        for (int i = end - 1; i > start && end - i <= MAX_TAG_SCAN; i--) {
            if (text.charAt(i) == '<') return i;
        }
        return end;
    }

    /**
     * A snippet for one hit, highlighted the way the query found it.
     *
     * A root search is handed the analyzer and the roots it was built from and
     * marks the derived words; every other search marks the query's own
     * characters. Passing a null analyzer, or calling past the highlighting
     * deadline, falls back to the literal path — which for a root search
     * usually finds nothing, and returns "" rather than a wrong mark.
     */
    public static String forHit(
            String text,
            List<String> normalizedTokens,
            org.apache.lucene.analysis.Analyzer morphologyAnalyzer,
            List<String> morphologyRoots,
            long deadlineNanos
    ) {
        if (text == null || text.isEmpty()) return "";
        if (morphologyAnalyzer != null
                && morphologyRoots != null
                && !morphologyRoots.isEmpty()
                && System.nanoTime() < deadlineNanos) {
            return makeMorphological(
                    text, MorphologySpans.find(morphologyAnalyzer, text, morphologyRoots, deadlineNanos));
        }
        return make(text, normalizedTokens);
    }

    /**
     * Build a snippet around words whose morphological root the query asked for.
     *
     * A root search matches «يصبرون» for «صبر», and the root itself is nowhere
     * in the page, so looking for the query's characters finds nothing — which
     * is why every morphological hit used to arrive with an empty snippet. The
     * positions come from re-analysing the text with the same analyzer the
     * index was built with, which reports each word's root and where it sat.
     */
    public static String makeMorphological(
            String text,
            java.util.List<MorphologySpans.Span> spans
    ) {
        if (text == null || text.isEmpty() || spans == null || spans.isEmpty()) return "";
        MorphologySpans.Span first = spans.get(0);
        int winStart = snapStart(text, Math.max(0, first.start() - WINDOW));
        int winEnd = snapEnd(text, winStart, Math.min(text.length(), first.end() + WINDOW));
        if (winEnd <= winStart) return "";
        String window = text.substring(winStart, winEnd);

        List<int[]> rawMarks = new ArrayList<>();
        for (MorphologySpans.Span sp : spans) {
            if (sp.end() <= winStart || sp.start() >= winEnd) continue;
            // Clamp to the window. Spans are collected further ahead than the
            // window shows, so a word straddling the far edge carries an end
            // past it; left unclamped the mark ran to the end of the snippet
            // and swallowed the trailing text.
            int s = Math.max(sp.start(), winStart) - winStart;
            int e = Math.min(sp.end(), winEnd) - winStart;
            if (e > s) rawMarks.add(new int[] { s, e });
        }
        StripResult stripped = stripHtmlKeepMarks(window, rawMarks);
        String cleanedRaw = stripped.text();
        // Wrap before collapsing whitespace: the marks are positions in the
        // stripped text, and collapsing would move them.
        StringBuilder sb = new StringBuilder(cleanedRaw.length() + 32);
        int cursor = 0;
        List<int[]> marks = new ArrayList<>(stripped.marks());
        marks.sort((a, b) -> Integer.compare(a[0], b[0]));
        for (int[] m : marks) {
            int s = Math.max(cursor, Math.min(m[0], cleanedRaw.length()));
            int e = Math.max(s, Math.min(m[1], cleanedRaw.length()));
            if (e <= s) continue;
            sb.append(cleanedRaw, cursor, s).append("<mark>").append(cleanedRaw, s, e).append("</mark>");
            cursor = e;
        }
        sb.append(cleanedRaw, cursor, cleanedRaw.length());
        String cleaned = sb.toString().replaceAll("[ \t\r\n]+", " ").trim();
        if (cleaned.isEmpty()) return "";
        String prefix = winStart > 0 ? "…" : "";
        String suffix = winEnd < text.length() ? "…" : "";
        return (prefix + cleaned + suffix).trim();
    }

    /**
     * Build a snippet for `text` highlighting any of `normalizedTokens`.
     * Returns "" when there's no match or no usable text.
     */
    public static String make(String text, List<String> normalizedTokens) {
        return make(text, normalizedTokens, Normalize.Variant.PAGE);
    }

    /**
     * As above, normalizing the haystack with the table of the index the tokens
     * came from. Passing PAGE for an aya hit leaves the snippet empty, because
     * the aya table folds «ائ» to «اا» and the page table does not.
     */
    public static String make(String text, List<String> normalizedTokens, Normalize.Variant variant) {
        if (text == null || text.isEmpty() || normalizedTokens == null || normalizedTokens.isEmpty()) return "";
        NormalizedHaystack hay = Normalize.normalizeHaystack(text, variant);
        String norm = hay.normalized();
        int[] map = hay.indexMap();

        // Collect every WHOLE-TOKEN match position (in normalized space).
        List<int[]> matches = new ArrayList<>();
        for (String tok : normalizedTokens) collectTokenMatches(norm, tok, matches);
        if (matches.isEmpty()) return "";
        matches.sort((a, b) -> Integer.compare(a[0], b[0]));

        int firstStart = matches.get(0)[0];
        int firstEnd = matches.get(0)[1];
        int winStartNorm = Math.max(0, firstStart - WINDOW);
        int winEndNorm = Math.min(norm.length(), firstEnd + WINDOW);

        int origWinStart = snapStart(text, map[winStartNorm]);
        int origWinEnd = snapEnd(text, origWinStart, map[winEndNorm]);
        if (origWinEnd <= origWinStart) return "";
        String snippetOrig = text.substring(origWinStart, origWinEnd);

        // Translate matches inside the window into snippet-local coordinates.
        List<int[]> rawMarks = new ArrayList<>();
        for (int[] m : matches) {
            int ns = m[0], ne = m[1];
            if (ne <= winStartNorm || ns >= winEndNorm) continue;
            int os = map[ns] - origWinStart;
            int oe = map[ne] - origWinStart;
            if (os < 0 || oe <= os) continue;
            rawMarks.add(new int[] { os, oe });
        }

        // Strip inline HTML tags and adjust mark coordinates accordingly.
        StripResult stripped = stripHtmlKeepMarks(snippetOrig, rawMarks);
        String cleaned = stripped.text.replaceAll("\\s+", " ").trim();
        if (cleaned.isEmpty()) return "";
        // Recompute marks against the whitespace-collapsed cleaned text.
        // Whitespace collapse can shift coordinates; in practice the ratio of
        // collapsed:original whitespace is small, but to keep <mark> tags
        // accurate we re-wrap by re-finding tokens in the cleaned text.
        String marked = applyMarksByRefind(cleaned, normalizedTokens, variant);

        String prefix = origWinStart > 0 ? "…" : "";
        String suffix = origWinEnd < text.length() ? "…" : "";
        return (prefix + marked + suffix).trim();
    }

    private record StripResult(String text, List<int[]> marks) {}

    private static StripResult stripHtmlKeepMarks(String text, List<int[]> marks) {
        if (text == null || text.isEmpty()) return new StripResult(text == null ? "" : text, List.of());
        StringBuilder out = new StringBuilder(text.length());
        int[] origIndex = new int[text.length() + 1];
        int n = 0;
        boolean inTag = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '<') { inTag = true; continue; }
            if (ch == '>') { inTag = false; continue; }
            if (inTag) continue;
            out.append(ch);
            origIndex[n++] = i;
        }
        origIndex[n] = text.length();
        // Adjust marks. Convert original index -> cleaned index via binary search on origIndex[0..n].
        int[] used = Arrays.copyOf(origIndex, n + 1);
        List<int[]> newMarks = new ArrayList<>(marks.size());
        for (int[] m : marks) {
            int cs = lowerBound(used, m[0]);
            int ce = lowerBound(used, m[1]);
            if (ce > cs) newMarks.add(new int[] { cs, ce });
        }
        return new StripResult(out.toString(), newMarks);
    }

    private static int lowerBound(int[] arr, int target) {
        int lo = 0, hi = arr.length;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (arr[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        return Math.min(lo, arr.length - 1);
    }

    /**
     * Re-find each normalized token in the cleaned text and wrap the
     * corresponding original substrings in &lt;mark&gt;. This is correct even
     * when the cleaned text has been whitespace-collapsed.
     */
    private static String applyMarksByRefind(String cleaned, List<String> normalizedTokens, Normalize.Variant variant) {
        NormalizedHaystack hay = Normalize.normalizeHaystack(cleaned, variant);
        String norm = hay.normalized();
        int[] map = hay.indexMap();

        // Whole-token again: the window may be right and the marks still land
        // inside «الشيخ» if this second pass scans for substrings.
        List<int[]> found = new ArrayList<>();
        for (String tok : normalizedTokens) collectTokenMatches(norm, tok, found);
        List<int[]> marks = new ArrayList<>(found.size());
        for (int[] m : found) marks.add(new int[] { map[m[0]], map[m[1]] });
        if (marks.isEmpty()) return cleaned;
        marks.sort((a, b) -> Integer.compare(a[0], b[0]));

        // Merge overlapping marks.
        List<int[]> merged = new ArrayList<>();
        for (int[] m : marks) {
            if (!merged.isEmpty() && m[0] <= merged.get(merged.size() - 1)[1]) {
                merged.get(merged.size() - 1)[1] = Math.max(merged.get(merged.size() - 1)[1], m[1]);
            } else {
                merged.add(new int[] { m[0], m[1] });
            }
        }

        StringBuilder out = new StringBuilder(cleaned.length() + merged.size() * 13);
        int cursor = 0;
        for (int[] m : merged) {
            int s = Math.max(m[0], cursor);
            int e = m[1];
            if (e <= s) continue;
            out.append(cleaned, cursor, s);
            out.append("<mark>");
            out.append(cleaned, s, e);
            out.append("</mark>");
            cursor = e;
        }
        out.append(cleaned, cursor, cleaned.length());
        return out.toString();
    }
}
