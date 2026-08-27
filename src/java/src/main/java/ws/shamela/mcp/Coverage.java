package ws.shamela.mcp;

import java.io.IOException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.lucene.index.LeafReaderContext;
import org.apache.lucene.index.NumericDocValues;
import org.apache.lucene.search.Collector;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.LeafCollector;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.Scorable;
import org.apache.lucene.search.ScoreMode;

/**
 * How a search's hits are distributed across books.
 *
 * This used to be counted from the page of results being returned, which made
 * it a statement about the page rather than about the search: asking for twenty
 * hits and being told the coverage of those twenty, presented as the coverage
 * of a quarter-million matches. A researcher deciding which books to read from
 * that number was reading a sample of one screen.
 *
 * It is now counted over every matching document, which Shamela's own index
 * makes cheap: the book number is stored as a numeric doc-value, a columnar
 * per-document field. Collecting it needs no stored-field read and no scoring,
 * so the whole result set can be walked at a fraction of the cost of fetching
 * one page of results.
 *
 * The window count is still available for the rare index that lacks the
 * doc-value, and the result says which basis was used rather than leaving the
 * reader to assume the better one.
 */
public final class Coverage {

    /** How the numbers below were arrived at. */
    public enum Basis {
        /** Every matching document was counted. */
        ALL_RESULTS,
        /** Only the fetched window — a sample, and labelled as one. */
        WINDOW
    }

    private static final int WINDOW_CAP = 5_000;
    private static final String BOOK_DOC_VALUE = "book";

    /**
     * How long the full pass may take before it is abandoned.
     *
     * A plain search walks its matches in well under this; a root search does
     * not. Root queries expand into a large disjunction whose full traversal
     * was measured at nearly a minute, while merely counting the same query
     * takes under a second — Lucene can count without visiting every match, but
     * not distribute them across books. Rather than make every root search
     * unusable for a statistic, the pass gives up here and the result says the
     * numbers describe the returned window instead.
     */
    private static final long BUDGET_MS = 1_500;

    /** Thrown to abandon the pass; never escapes collectAll. */
    private static final class Timeout extends RuntimeException {
        Timeout() { super(null, null, false, false); }
    }

    private final LinkedHashMap<String, Integer> byBookKey = new LinkedHashMap<>();
    private int totalSeen = 0;
    private Basis basis = Basis.WINDOW;

    /** Count one hit from the fetched window. */
    public void recordBookKey(String bookKey) {
        if (totalSeen >= WINDOW_CAP) return;
        byBookKey.merge(bookKey, 1, Integer::sum);
        totalSeen++;
    }

    public Map<String, Integer> snapshot() {
        return byBookKey;
    }

    public int total() { return totalSeen; }

    /** True only when counting was cut short; never true for a full pass. */
    public boolean atCap() { return basis == Basis.WINDOW && totalSeen >= WINDOW_CAP; }

    public Basis basis() { return basis; }

    /**
     * Count every document the query matches, by book.
     *
     * Returns false when the index has no `book` doc-value to read, leaving the
     * caller on the window count rather than reporting a full pass that did not
     * happen.
     */
    public boolean collectAll(IndexSearcher searcher, Query query) throws IOException {
        Map<Integer, Integer> counts = new HashMap<>();
        boolean[] usable = { true };
        final long deadline = System.nanoTime() + BUDGET_MS * 1_000_000L;

        try {
        searcher.search(query, new Collector() {
            @Override
            public ScoreMode scoreMode() {
                // Nothing here needs a score, and saying so lets Lucene skip
                // scoring entirely for the whole pass.
                return ScoreMode.COMPLETE_NO_SCORES;
            }

            @Override
            public LeafCollector getLeafCollector(LeafReaderContext context) throws IOException {
                NumericDocValues books = context.reader().getNumericDocValues(BOOK_DOC_VALUE);
                if (books == null) {
                    usable[0] = false;
                    return new LeafCollector() {
                        @Override public void setScorer(Scorable scorer) {}
                        @Override public void collect(int doc) {}
                    };
                }
                return new LeafCollector() {
                    private int sinceCheck = 0;

                    @Override public void setScorer(Scorable scorer) {}

                    @Override
                    public void collect(int doc) throws IOException {
                        // Checking the clock every hit would cost more than the
                        // work; every few thousand is precise enough to bound.
                        if (++sinceCheck >= 4_096) {
                            sinceCheck = 0;
                            if (System.nanoTime() > deadline) throw new Timeout();
                        }
                        // Doc-values iterate forward; advanceExact is the
                        // supported way to read one at an arbitrary doc.
                        if (books.advanceExact(doc)) {
                            counts.merge((int) books.longValue(), 1, Integer::sum);
                        }
                    }
                };
            }
        });
        } catch (Timeout t) {
            // Partial counts would misrepresent the distribution, so they are
            // discarded and the caller falls back to counting the window.
            return false;
        }

        if (!usable[0]) return false;

        byBookKey.clear();
        totalSeen = 0;
        for (Map.Entry<Integer, Integer> e : counts.entrySet()) {
            byBookKey.put(String.valueOf(e.getKey()), e.getValue());
            totalSeen += e.getValue();
        }
        basis = Basis.ALL_RESULTS;
        return true;
    }
}
