package ws.shamela.mcp;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;

/**
 * Finding where a morphological match actually sits in the text.
 *
 * A root search asks the index for a root — «صبر» — and matches pages whose
 * words derive from it. But the page holds «يصبرون», «الصابرين», «اصطبارًا»:
 * the root never appears literally. Highlighting by looking for the query's
 * characters therefore found nothing, and every root-search hit came back with
 * a correct page and an empty snippet, which reads as though the search itself
 * had failed.
 *
 * The analysis that answers this is expensive in a way ordinary text handling
 * is not: each word is looked up in a morphological database rather than
 * matched, so analysing whole pages for highlighting measured in tens of
 * seconds per search — turning a sub-second query into an unusable one. Two
 * things keep it cheap enough to be worth having:
 *
 *   - Words are analysed once and remembered. Arabic prose repeats heavily,
 *     within a page and across them, so most lookups after the first pages are
 *     answered from memory.
 *   - There is a hard ceiling on how much text is examined per field. The
 *     snippet shows a window around the first match; beyond what it can display
 *     there is nothing to gain. A match past the ceiling still counted as a
 *     match — the search found it — it simply is not highlighted.
 */
public final class MorphologySpans {

    private MorphologySpans() {}

    /** A character range in the original text. */
    public record Span(int start, int end) {}

    /**
     * How long morphological highlighting may take for one search.
     *
     * Locating derived words is worth a wait, but not an unbounded one: a root
     * whose letters are common admits far more words to the analyzer than a
     * distinctive one, and the slowest measured a quarter-minute. Past this
     * point the remaining results fall back to plain highlighting, so a search
     * stays answerable in seconds whatever root it was handed.
     */
    public static final long BUDGET_MS = 5_000;

    /** The instant past which highlighting gives up, for one search. */
    public static long deadline() {
        return System.nanoTime() + BUDGET_MS * 1_000_000L;
    }

    /**
     * The roots a whole query reduces to — what a root search is looking for.
     *
     * Derived once per search, because the analyzer is the expensive part.
     */
    public static List<String> rootsOfQuery(Analyzer analyzer, List<String> tokens) {
        List<String> roots = new ArrayList<>();
        if (analyzer == null || tokens == null) return roots;
        for (String tok : tokens) roots.addAll(rootsOf(analyzer, tok));
        return roots;
    }

    /** Characters examined per field before giving up on highlighting. */
    private static final int SCAN_LIMIT_CHARS = 4_000;

    /** How far past the first match to keep looking, for further marks. */
    private static final int LOOKAHEAD_CHARS = 200;

    /**
     * Remembered word → roots; oldest entries fall out.
     *
     * Access order, and large. Both were measured rather than assumed: a
     * smaller insertion-ordered table looked cheaper per lookup and produced
     * visibly fewer highlights for the same time budget, because what this
     * cache is really buying is the words a search revisits from one page to
     * the next.
     */
    private static final int CACHE_LIMIT = 200_000;
    private static final Map<String, Set<String>> ROOT_CACHE =
            Collections.synchronizedMap(new LinkedHashMap<String, Set<String>>(1024, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Set<String>> eldest) {
                    return size() > CACHE_LIMIT;
                }
            });

    /**
     * Letters a root can lose on the way to a word.
     *
     * Arabic derivation keeps the root's letters and their order — «صبر» is
     * still visible in «الصابرين», «يصطبر», «مصابرة». The weak letters are the
     * exception: «قول» surfaces as «قال» with the و gone, and hamza is written
     * half a dozen ways. Treating these as optional is what lets the cheap
     * filter below stay conservative on exactly the roots that would otherwise
     * be silently dropped.
     */
    private static final String WEAK = "اأإآىيوءئؤ";

    /** Letters a derivation may insert between two root letters. */
    private static final int GAP_ALLOWANCE = 2;

    /** Vowel marks and tatweel, which sit between a root's letters. */
    private static String fold(String word) {
        StringBuilder sb = new StringBuilder(word.length());
        for (int i = 0; i < word.length(); i++) {
            char c = word.charAt(i);
            if (c == 'ـ' || Character.getType(c) == Character.NON_SPACING_MARK) continue;
            sb.append(c);
        }
        return sb.toString();
    }

    /**
     * Whether `word` could possibly derive from `root`, decided by letters alone.
     *
     * Morphological analysis costs a database lookup per word — measured at
     * roughly three milliseconds, which over the words of twenty pages is half
     * a minute. Almost all of those words have nothing to do with the root
     * being searched, and the vast majority can be dismissed by a test that
     * costs nothing: a derived word contains its root's strong letters, in
     * order. What survives goes to the analyzer, which remains the authority on
     * whether the word truly derives from the root.
     *
     * The test only ever admits words for analysis; it never decides a match.
     */
    private static boolean couldDerive(String folded, String root) {
        int i = 0;
        int slack = 0;
        boolean started = false;
        char previous = 0;
        for (int r = 0; r < root.length(); r++) {
            char rc = root.charAt(r);
            if (WEAK.indexOf(rc) >= 0) { slack++; continue; }
            // A doubled root writes its repeated letter once in most of its
            // words: «مدد» gives «مد» and «يمد», never «مدد» itself. Demanding
            // both copies rejected almost the whole family.
            if (rc == previous) { slack++; continue; }
            previous = rc;
            int at = folded.indexOf(rc, i);
            if (at < 0) return false;
            // Prefixes and suffixes attach outside the root, so only the gaps
            // *between* its letters are bounded — and what goes there is an
            // infix, a letter or two at most. Without this, a root of two
            // common letters such as «بيع» admitted half the words on the page
            // to the analyzer, and the analyzer is the whole cost.
            if (started && at - i > GAP_ALLOWANCE + slack) return false;
            started = true;
            slack = 0;
            i = at + 1;
        }
        return true;
    }

    /**
     * The roots one word reduces to; a word can be ambiguous and yield several.
     *
     * Public because the caller needs it for the query as well as for the text.
     * The roots to look for are whatever the analyzer makes of the query — the
     * same terms the search itself was built from. Using our own normalizer's
     * output instead compares two different vocabularies, which is why roots
     * carrying a hamza, «سأل» and «أمر», matched pages and then highlighted
     * nothing at all in them.
     *
     * The field name is asked about but does not matter: the analyzer was
     * probed against the real install across body/m_body/foot/m_foot/n_body and
     * an unknown name, and returned the same set of roots for every word each
     * time — only their order varied. So highlighting under "body" compares the
     * same vocabulary the `m_` fields were indexed with.
     */
    public static Set<String> rootsOf(Analyzer analyzer, String word) {
        Set<String> cached = ROOT_CACHE.get(word);
        if (cached != null) return cached;
        Set<String> roots = new HashSet<>(2);
        try (TokenStream ts = analyzer.tokenStream("body", new StringReader(word))) {
            CharTermAttribute term = ts.addAttribute(CharTermAttribute.class);
            ts.reset();
            while (ts.incrementToken()) roots.add(term.toString());
            ts.end();
        } catch (IOException | RuntimeException e) {
            // Not remembered. A word the analyzer failed on once is not a word
            // without roots, and caching the failure would silently drop its
            // highlighting for the rest of the process's life.
            return Set.of();
        }
        ROOT_CACHE.put(word, roots);
        return roots;
    }

    /**
     * True for characters that belong to the word being read.
     *
     * Vowel marks count. They are combining marks rather than letters, so a
     * letters-only test would cut «الصَّابرين» in half at the shadda and hand
     * the analyzer two fragments that are not words at all.
     */
    private static boolean isWordChar(char c) {
        return Character.isLetter(c) || Character.getType(c) == Character.NON_SPACING_MARK;
    }

    /**
     * Character ranges in `text` whose morphological root is one of `roots`.
     *
     * Returns an empty list rather than throwing when analysis fails: a missing
     * highlight is a blemish, a failed search is not.
     */
    public static List<Span> find(Analyzer analyzer, String text, List<String> roots, long deadlineNanos) {
        List<Span> spans = new ArrayList<>();
        if (analyzer == null || text == null || text.isEmpty() || roots == null || roots.isEmpty()) {
            return spans;
        }
        Set<String> wanted = new HashSet<>(roots);
        int limit = Math.min(text.length(), SCAN_LIMIT_CHARS);
        int stopAfter = Integer.MAX_VALUE;
        int sinceCheck = 0;

        int i = 0;
        while (i < limit) {
            if (!isWordChar(text.charAt(i))) { i++; continue; }
            int start = i;
            while (i < text.length() && isWordChar(text.charAt(i))) i++;
            int end = i;
            if (start > stopAfter) break;

            String folded = fold(text.substring(start, end));
            if (folded.isEmpty()) continue;
            if (!wanted.contains(folded)) {
                boolean worthAnalysing = false;
                for (String root : wanted) {
                    if (couldDerive(folded, root)) { worthAnalysing = true; break; }
                }
                if (!worthAnalysing) continue;
                // Only analysed words cost anything, so the clock is worth
                // reading here and nowhere else in the loop.
                if (++sinceCheck >= 64) {
                    sinceCheck = 0;
                    if (System.nanoTime() > deadlineNanos) break;
                }
                if (!intersects(rootsOf(analyzer, folded), wanted)) continue;
            }
            if (spans.isEmpty()) stopAfter = end + LOOKAHEAD_CHARS;
            spans.add(new Span(start, end));
        }
        return spans;
    }

    private static boolean intersects(Set<String> a, Set<String> b) {
        if (a.isEmpty()) return false;
        for (String x : a) if (b.contains(x)) return true;
        return false;
    }
}
