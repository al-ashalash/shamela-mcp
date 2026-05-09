package ws.shamela.mcp;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.lucene.document.Document;
import org.apache.lucene.index.StoredFields;
import org.apache.lucene.index.Term;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;

import ws.shamela.mcp.Catalog.BookInfo;

/**
 * shamela_search_pages — multi-token AND across body+foot fields of the
 * page index, with Arabic normalization applied to each query token.
 */
public final class SearchPages {

    private SearchPages() {}

    static final String INDEX = "page";

    public static Map<String, Object> run(
            IndexCache indexCache,
            Catalog catalog,
            BookPages bookPages,
            String rawQuery,
            int maxResults
    ) throws IOException {
        List<String> tokens = Normalize.normalizeQuery(rawQuery);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("query", rawQuery == null ? "" : rawQuery);
        envelope.put("normalized_tokens", tokens);

        if (tokens.isEmpty()) {
            envelope.put("total_hits", 0);
            envelope.put("returned", 0);
            envelope.put("results", List.of());
            return envelope;
        }

        Query q = buildQuery(tokens);
        IndexSearcher searcher = indexCache.searcher(INDEX);
        StoredFields stored = indexCache.storedFields(INDEX);

        int safeMax = Math.max(1, Math.min(maxResults, 100));
        long total = searcher.count(q);
        TopDocs top = searcher.search(q, safeMax);

        List<Map<String, Object>> results = new ArrayList<>(top.scoreDocs.length);
        for (ScoreDoc sd : top.scoreDocs) {
            Document doc = stored.document(sd.doc);
            String idField = doc.get("id");
            if (idField == null) continue;
            int dash = idField.indexOf('-');
            if (dash < 0) continue;
            int bookId, pageId;
            try {
                bookId = Integer.parseInt(idField.substring(0, dash));
                pageId = Integer.parseInt(idField.substring(dash + 1));
            } catch (NumberFormatException e) {
                continue;
            }

            String body = nullToEmpty(doc.get("body"));
            String foot = nullToEmpty(doc.get("foot"));

            List<String> matchedIn = new ArrayList<>(2);
            String snippetBody = "";
            String snippetFoot = "";
            if (containsAny(body, tokens)) {
                matchedIn.add("body");
                snippetBody = Snippet.make(body, tokens);
            }
            if (containsAny(foot, tokens)) {
                matchedIn.add("foot");
                snippetFoot = Snippet.make(foot, tokens);
            }

            BookInfo info = catalog.bookOrPlaceholder(bookId);
            String printed = bookPages.printedPage(bookId, pageId);

            Map<String, Object> hit = new LinkedHashMap<>();
            hit.put("book_id", bookId);
            hit.put("book_name", info.bookName());
            hit.put("author_name", info.authorName());
            hit.put("page_id", pageId);
            hit.put("printed_page", printed);
            hit.put("matched_in", matchedIn);
            hit.put("snippet_body", snippetBody);
            hit.put("snippet_foot", snippetFoot);
            results.add(hit);
        }

        envelope.put("total_hits", (int) Math.min(total, Integer.MAX_VALUE));
        envelope.put("returned", results.size());
        envelope.put("results", results);
        return envelope;
    }

    static Query buildQuery(List<String> tokens) {
        BooleanQuery.Builder outer = new BooleanQuery.Builder();
        for (String tok : tokens) {
            BooleanQuery.Builder inner = new BooleanQuery.Builder();
            inner.setMinimumNumberShouldMatch(1);
            inner.add(new TermQuery(new Term("body", tok)), BooleanClause.Occur.SHOULD);
            inner.add(new TermQuery(new Term("foot", tok)), BooleanClause.Occur.SHOULD);
            outer.add(inner.build(), BooleanClause.Occur.MUST);
        }
        return outer.build();
    }

    private static boolean containsAny(String text, List<String> normalizedTokens) {
        if (text == null || text.isEmpty()) return false;
        String norm = Normalize.normalizeHaystack(text).normalized();
        for (String tok : normalizedTokens) {
            if (tok != null && !tok.isEmpty() && norm.contains(tok)) return true;
        }
        return false;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
