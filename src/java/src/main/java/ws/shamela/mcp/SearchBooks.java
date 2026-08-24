package ws.shamela.mcp;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.index.StoredFields;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;

/** search_books — catalog metadata search with scope + options + coverage. */
public final class SearchBooks {

    private SearchBooks() {}

    static final String INDEX = "book";

    public static Map<String, Object> run(
            IndexCache indexCache,
            Analyzer morphologyAnalyzer,
            String rawQuery,
            List<String> scopeBookKeys,
            int maxResults,
            int offset,
            boolean morphology,
            boolean wildcards
    ) throws IOException {
        Normalize.QueryTokens parsed = Normalize.normalizeQueryDetailed(rawQuery, Normalize.Variant.PAGE);
        List<String> tokens = parsed.tokens();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("query", rawQuery == null ? "" : rawQuery);
        envelope.put("normalized_tokens", tokens);
        envelope.put("dropped_tokens", parsed.dropped());
        envelope.put("offset", offset);

        if (tokens.isEmpty()) {
            envelope.put("total_hits", 0);
            envelope.put("returned", 0);
            envelope.put("has_more", false);
            envelope.put("results", List.of());
            return envelope;
        }

        // book/ docs use field name "body" for the searchable concatenation
        // (book_name + author_names + bibliography), per spec §1.3.
        // Note: scope filtering by book_key on the book index is unusual but works:
        // book index docs have a `book` ord field equal to book_id; we filter by `id`
        // which is stored as the bare book_id string.
        Query q = QueryBuilder.build(tokens, List.of("body"), wildcards, morphology, morphologyAnalyzer, null);
        IndexSearcher searcher = indexCache.searcher(INDEX);
        StoredFields stored = indexCache.storedFields(INDEX);

        int safeMax = Math.max(1, Math.min(maxResults, 100));
        int safeOffset = Math.max(0, offset);
        long total = searcher.count(q);
        int fetch = Math.min(safeOffset + safeMax, SearchPages.PAGE_CEILING);
        TopDocs top = searcher.search(q, fetch);

        // Optional scope filter applied post-fetch since book/ index doesn't have book_key.
        java.util.Set<Integer> scopeIds = null;
        if (scopeBookKeys != null && !scopeBookKeys.isEmpty()) {
            scopeIds = new java.util.HashSet<>();
            for (String k : scopeBookKeys) {
                try { scopeIds.add(Integer.parseInt(k)); } catch (NumberFormatException ignore) {}
            }
        }

        Coverage coverage = new Coverage();
        // Only a scope-free search can be counted over every match: the scope
        // here is applied after the fetch, so a full pass would count books the
        // caller asked to leave out.
        boolean fullCoverage = scopeIds == null && coverage.collectAll(searcher, q);

        // A root search matches «الصابرين» for «صبر»; the root itself is not in
        // the bibliography, so the literal highlighter finds nothing there.
        List<String> morphRoots = morphology
                ? MorphologySpans.rootsOfQuery(morphologyAnalyzer, tokens)
                : List.of();
        final long highlightDeadline = MorphologySpans.deadline();

        List<Map<String, Object>> results = new ArrayList<>();
        int seen = 0;
        for (ScoreDoc sd : top.scoreDocs) {
            Document doc = stored.document(sd.doc);
            String idField = doc.get("id");
            if (idField == null) continue;
            int bookId;
            try { bookId = Integer.parseInt(idField.trim()); }
            catch (NumberFormatException e) { continue; }
            if (scopeIds != null && !scopeIds.contains(bookId)) continue;

            if (!fullCoverage) coverage.recordBookKey(idField);

            if (seen++ < safeOffset) continue;
            if (results.size() >= safeMax) continue;

            String biblio = nullToEmpty(doc.get("body_store"));
            String snippet = Snippet.forHit(
                    biblio, tokens, morphology ? morphologyAnalyzer : null, morphRoots, highlightDeadline);

            Map<String, Object> hit = new LinkedHashMap<>();
            hit.put("book_id", bookId);
            hit.put("snippet", snippet);
            results.add(hit);
        }

        Map<String, Object> coverageMap = new LinkedHashMap<>();
        coverageMap.put("by_book_key", coverage.snapshot());
        coverageMap.put("total_seen", coverage.total());
        coverageMap.put("basis", coverage.basis() == Coverage.Basis.ALL_RESULTS ? "all_results" : "window");

        envelope.put("total_hits", (int) Math.min(total, Integer.MAX_VALUE));
        envelope.put("returned", results.size());
        // Paging stops where fetching does. Computed against the exhaustive
        // total, has_more stayed true past the 5,000-row ceiling and handed back
        // the offset it was given — a caller following next_offset never
        // finished. total_hits still reports every match, so the gap between the
        // two is visible and the renderers name it.
        long reachable = Math.min(total, SearchPages.PAGE_CEILING);
        envelope.put("has_more", (long) (safeOffset + results.size()) < reachable);
        if ((long) (safeOffset + results.size()) < reachable) {
            envelope.put("next_offset", safeOffset + results.size());
        }
        envelope.put("coverage", coverageMap);
        envelope.put("results", results);
        return envelope;
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }
}
