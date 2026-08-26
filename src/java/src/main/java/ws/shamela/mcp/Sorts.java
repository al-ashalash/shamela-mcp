package ws.shamela.mcp;

import java.io.IOException;
import java.util.Map;

import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.Sort;
import org.apache.lucene.search.SortField;
import org.apache.lucene.search.TopDocs;

/**
 * The order Shamela returns hits in.
 *
 * Shamela wraps every query in a {@code ConstantScoreQuery} and has no
 * relevance ranking at all (search-engine-spec §7.2); the order the reader
 * sees comes entirely from a sort spec over numeric doc-values the index
 * already ships. Without that sort Lucene falls back to ascending document
 * id — the order the importer happened to write the segments in — and a
 * search whose matches are spread across the library is answered from
 * whichever corner of it was indexed first. Measured: «الخيار المجلس»
 * matches 2,703 pages spread over seven categories, and all thirty rows of
 * the first page came from usul alone — 2.8% of the matches.
 */
public final class Sorts {

    private Sorts() {}

    /**
     * Per index, the sort keys in order, all ascending (spec §7.2).
     *
     * A key no segment carries is a silent no-op — Lucene reads it as zero for
     * every document and the sort falls through to the next key — which is what
     * `book_up` is on every install: master.db has the column and it is null in
     * all 8,598 rows, so Shamela never writes it. A key a segment declares with
     * some OTHER doc-values type would throw. That is deliberate: an index whose
     * fields we have misread should fail loudly rather than answer in an order
     * that is not Shamela's while claiming it is.
     */
    private static final Map<String, String[]> SPEC = Map.of(
            SearchPages.INDEX,
            new String[] { "date", "author", "book_up", "group", "group_order", "book", "page" },
            SearchTitles.INDEX,
            new String[] { "date", "author", "book_up", "group", "group_order", "book", "page" },
            SearchBooks.INDEX,
            new String[] { "date", "author", "book_up", "group", "group_order", "book" },
            SearchAuthors.INDEX,
            new String[] { "date", "author_id" },
            SearchQuran.INDEX,
            new String[] { "aya_id" });

    /**
     * The sort for one index, or null where the spec asks for document order.
     *
     * Immutable and reusable, so it is built once per open reader and held by
     * IndexCache; reopening an index after a download rebuilds it, because a
     * new segment could in principle carry a field the old ones did not.
     */
    public static Sort forIndex(String index) {
        String[] spec = SPEC.get(index);
        if (spec == null) return null;
        SortField[] keys = new SortField[spec.length];
        for (int i = 0; i < spec.length; i++) keys[i] = new SortField(spec[i], SortField.Type.LONG, false);
        return new Sort(keys);
    }

    /** Search one index in Shamela's order — or in document order where it has none. */
    static TopDocs search(IndexCache cache, String index, Query query, int n) throws IOException {
        IndexSearcher searcher = cache.searcher(index);
        Sort sort = cache.sort(index);
        return sort == null ? searcher.search(query, n) : searcher.search(query, n, sort);
    }
}