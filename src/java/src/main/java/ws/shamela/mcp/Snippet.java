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
     * Build a snippet for `text` highlighting any of `normalizedTokens`.
     * Returns "" when there's no match or no usable text.
     */
    public static String make(String text, List<String> normalizedTokens) {
        if (text == null || text.isEmpty() || normalizedTokens == null || normalizedTokens.isEmpty()) return "";
        NormalizedHaystack hay = Normalize.normalizeHaystack(text);
        String norm = hay.normalized();
        int[] map = hay.indexMap();

        // Collect every match position (in normalized space).
        List<int[]> matches = new ArrayList<>();
        for (String tok : normalizedTokens) {
            if (tok == null || tok.isEmpty()) continue;
            int from = 0;
            while (true) {
                int pos = norm.indexOf(tok, from);
                if (pos < 0) break;
                matches.add(new int[] { pos, pos + tok.length() });
                from = pos + tok.length();
            }
        }
        if (matches.isEmpty()) return "";
        matches.sort((a, b) -> Integer.compare(a[0], b[0]));

        int firstStart = matches.get(0)[0];
        int firstEnd = matches.get(0)[1];
        int winStartNorm = Math.max(0, firstStart - WINDOW);
        int winEndNorm = Math.min(norm.length(), firstEnd + WINDOW);

        int origWinStart = map[winStartNorm];
        int origWinEnd = map[winEndNorm];
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
        String marked = applyMarksByRefind(cleaned, normalizedTokens);

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
    private static String applyMarksByRefind(String cleaned, List<String> normalizedTokens) {
        NormalizedHaystack hay = Normalize.normalizeHaystack(cleaned);
        String norm = hay.normalized();
        int[] map = hay.indexMap();

        List<int[]> marks = new ArrayList<>();
        for (String tok : normalizedTokens) {
            if (tok == null || tok.isEmpty()) continue;
            int from = 0;
            while (true) {
                int pos = norm.indexOf(tok, from);
                if (pos < 0) break;
                int s = map[pos];
                int e = map[pos + tok.length()];
                marks.add(new int[] { s, e });
                from = pos + tok.length();
            }
        }
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
