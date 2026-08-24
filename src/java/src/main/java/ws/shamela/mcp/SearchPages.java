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

/**
 * search_pages — page body/foot/comment search with scope filtering, options
 * (morphology, wildcards, search_in), pagination, and coverage aggregation.
 * See docs/architecture.md and docs/ipc-protocol.md.
 */
public final class SearchPages {

    private SearchPages() {}

    static final String INDEX = "page";

    /**
     * Rows any one search will fetch, and therefore how deep paging can go.
     *
     * A search over a million pages cannot hold them all in a result window,
     * and nothing needs it to: what the ceiling costs is the hits past it, and
     * what it must never cost is a caller that cannot tell it has arrived.
     */
    static final int PAGE_CEILING = 5_000;

    public static Map<String, Object> run(
            IndexCache indexCache,
            Analyzer morphologyAnalyzer,
            String rawQuery,
            List<String> scopeBookKeys,
            int maxResults,
            int offset,
            boolean morphology,
            boolean wildcards,
            List<String> searchIn,
            boolean wantCoverage
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
            envelope.put("scope_count", scopeBookKeys == null ? -1 : scopeBookKeys.size());
            envelope.put("coverage", emptyCoverage());
            envelope.put("results", List.of());
            return envelope;
        }

        // Query target fields based on search_in.
        List<String> fields = effectiveFields(searchIn);

        Query q = QueryBuilder.build(tokens, fields, wildcards, morphology, morphologyAnalyzer, scopeBookKeys);
        return execute(indexCache, morphologyAnalyzer, q, envelope, tokens, null, null, fields,
                scopeBookKeys, maxResults, offset, morphology, wantCoverage);
    }

    /**
     * Run a page query and dress its hits — the part every page search shares.
     *
     * The query itself is what differs between an ordinary search and a phrase,
     * proximity or boolean one; everything after it — paging, coverage, reading
     * the stored text, highlighting — is the same work, and doing it in one
     * place is what lets the advanced searches answer over the whole library
     * instead of over a window of candidates.
     */
    static Map<String, Object> execute(
            IndexCache indexCache,
            Analyzer morphologyAnalyzer,
            Query q,
            Map<String, Object> envelope,
            List<String> tokens,
            List<String> fallbackTokens,
            Map<String, List<String>> termGroups,
            List<String> fields,
            List<String> scopeBookKeys,
            int maxResults,
            int offset,
            boolean morphology,
            boolean wantCoverage
    ) throws IOException {
        IndexSearcher searcher = indexCache.searcher(INDEX);
        StoredFields stored = indexCache.storedFields(INDEX);

        int safeMax = Math.max(1, Math.min(maxResults, 100));
        int safeOffset = Math.max(0, offset);
        // Fetch enough hits to skip `offset`. Lucene's searchAfter is more efficient
        // for deep pagination but we rely on a single search with limit =
        // offset + safeMax, capped at COVERAGE_CAP so we don't OOM on huge totals.
        int fetch = Math.min(safeOffset + safeMax, PAGE_CEILING);
        TopDocs top = searcher.search(q, fetch);

        // Counting is cheap even for queries whose full traversal is not:
        // Lucene can total a query without visiting every match.
        long total = searcher.count(q);
        Coverage coverage = new Coverage();
        // Distributing those matches across books does require visiting them,
        // so the pass is time-boxed. Where it completes — which is the ordinary
        // case — the figures describe every match instead of one page of them;
        // where it does not, they describe the window and the envelope says so.
        // Only when someone is going to read it. Several callers ask this
        // command for pages and throw the rollup away, and walking a million
        // matches for a number nobody looks at is the most expensive thing
        // this search could do.
        boolean fullCoverage = wantCoverage && coverage.collectAll(searcher, q);

        // What a morphological search is actually looking for: the analyzer's
        // reading of the query, which is what the query was built from. Derived
        // once, because the analyzer is the expensive part.
        List<String> morphRoots = morphology
                ? MorphologySpans.rootsOfQuery(morphologyAnalyzer, tokens)
                : List.of();
        final long morphDeadline = MorphologySpans.deadline();

        List<Map<String, Object>> results = new ArrayList<>();
        int seen = 0;
        for (ScoreDoc sd : top.scoreDocs) {
            // Reading a document's stored text is the expensive part of the
            // loop. A row before the caller's offset, or past the page being
            // returned, is only ever read for its book number — and once the
            // full coverage pass has already counted every match, not even for
            // that. Skipping it is what makes a deep offset cheap.
            if (fullCoverage && (seen < safeOffset || results.size() >= safeMax)) {
                seen++;
                continue;
            }
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
            // Only needed when the full pass was not possible; otherwise the
            // counts already cover every match.
            if (!fullCoverage) coverage.recordBookKey(idField.substring(0, dash));

            if (seen++ < safeOffset) continue;
            if (results.size() >= safeMax) continue;

            String body = fields.contains("body") ? nullToEmpty(doc.get("body")) : "";
            String foot = fields.contains("foot") ? nullToEmpty(doc.get("foot")) : "";
            String comment = fields.contains("comment") ? nullToEmpty(doc.get("comment")) : "";

            List<String> matchedIn = new ArrayList<>(3);
            String snippetBody = "";
            String snippetFoot = "";
            String snippetComment = "";
            if (morphology && System.nanoTime() < morphDeadline) {
                // The root the query asked for is not in the text; the words
                // derived from it are. Ask the analyzer where they sit.
                // A field is only reported as matched once a snippet for it
                // actually came back: stripping can empty a window that held
                // nothing but markup, and a field claimed with a blank snippet
                // reads exactly like the bug this fix exists to close.
                snippetBody = Snippet.makeMorphological(
                        body, MorphologySpans.find(morphologyAnalyzer, body, morphRoots, morphDeadline));
                snippetFoot = Snippet.makeMorphological(
                        foot, MorphologySpans.find(morphologyAnalyzer, foot, morphRoots, morphDeadline));
                snippetComment = Snippet.makeMorphological(
                        comment, MorphologySpans.find(morphologyAnalyzer, comment, morphRoots, morphDeadline));
                if (!snippetBody.isEmpty()) matchedIn.add("body");
                if (!snippetFoot.isEmpty()) matchedIn.add("foot");
                if (!snippetComment.isEmpty()) matchedIn.add("comment");
            } else {
                List<String> marks = tokens;
                // A phrase is marked as a phrase, but the index and the snippet
                // read the text differently enough that a page the index calls
                // a phrase match may not spell it that way once normalized. A
                // hit with nothing shown is worse than a hit shown word by
                // word, so the words are the fallback.
                if (fallbackTokens != null
                        && !containsAny(body, tokens)
                        && !containsAny(foot, tokens)
                        && !containsAny(comment, tokens)) {
                    marks = fallbackTokens;
                }
                if (!body.isEmpty() && containsAny(body, marks)) {
                    matchedIn.add("body");
                    snippetBody = Snippet.make(body, marks);
                }
                if (!foot.isEmpty() && containsAny(foot, marks)) {
                    matchedIn.add("foot");
                    snippetFoot = Snippet.make(foot, marks);
                }
                if (!comment.isEmpty() && containsAny(comment, marks)) {
                    matchedIn.add("comment");
                    snippetComment = Snippet.make(comment, marks);
                }
            }

            Map<String, Object> hit = new LinkedHashMap<>();
            hit.put("book_id", bookId);
            hit.put("page_id", pageId);
            hit.put("matched_in", matchedIn);
            // Which of the asked-for terms this page actually carries. The text
            // is already in hand here, so saying so costs nothing — and a
            // boolean search that reports «any of these» owes the reader which
            // one it was.
            if (termGroups != null) {
                List<String> matchedTerms = new ArrayList<>();
                for (Map.Entry<String, List<String>> e : termGroups.entrySet()) {
                    if (containsAll(body, foot, comment, e.getValue())) matchedTerms.add(e.getKey());
                }
                hit.put("matched_terms", matchedTerms);
            }
            hit.put("snippet_body", snippetBody);
            hit.put("snippet_foot", snippetFoot);
            hit.put("snippet_comment", snippetComment);
            results.add(hit);
        }

        Map<String, Object> coverageMap = new LinkedHashMap<>();
        coverageMap.put("by_book_key", coverage.snapshot());
        coverageMap.put("total_seen", coverage.total());
        coverageMap.put("at_cap", coverage.atCap());
        // Say what the numbers describe: every match, or just this page of them.
        coverageMap.put("basis", coverage.basis() == Coverage.Basis.ALL_RESULTS ? "all_results" : "window");

        envelope.put("total_hits", (int) Math.min(total, Integer.MAX_VALUE));
        envelope.put("returned", results.size());
        // Paging stops where fetching does. Computed against the exhaustive
        // total, has_more stayed true past the 5,000-row ceiling and handed back
        // the offset it was given — a caller following next_offset never
        // finished. total_hits still reports every match, so the gap between the
        // two is visible and the renderers name it.
        long reachable = Math.min(total, PAGE_CEILING);
        envelope.put("has_more", (long) (safeOffset + results.size()) < reachable);
        if ((long) (safeOffset + results.size()) < reachable) {
            envelope.put("next_offset", safeOffset + results.size());
        }
        envelope.put("scope_count", scopeBookKeys == null ? -1 : scopeBookKeys.size());
        envelope.put("coverage", coverageMap);
        envelope.put("results", results);
        return envelope;
    }

    static List<String> effectiveFields(List<String> searchIn) {
        if (searchIn == null || searchIn.isEmpty()) return List.of("body", "foot");
        List<String> out = new ArrayList<>();
        for (String f : searchIn) {
            if ("body".equals(f) || "foot".equals(f) || "comment".equals(f)) {
                if (!out.contains(f)) out.add(f);
            }
        }
        if (out.isEmpty()) return List.of("body", "foot");
        return out;
    }

    /** True when every one of a term's words is somewhere on the page. */
    private static boolean containsAll(String body, String foot, String comment, List<String> tokens) {
        for (String tok : tokens) {
            List<String> one = List.of(tok);
            if (!containsAny(body, one) && !containsAny(foot, one) && !containsAny(comment, one)) return false;
        }
        return true;
    }

    private static boolean containsAny(String text, List<String> normalizedTokens) {
        if (text == null || text.isEmpty()) return false;
        String norm = Normalize.normalizeHaystack(text).normalized();
        for (String tok : normalizedTokens) {
            if (tok == null || tok.isEmpty()) continue;
            String stripped = tok.replace("*", "").replace("?", "");
            if (stripped.isEmpty()) continue;
            if (norm.contains(stripped)) return true;
        }
        return false;
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }

    private static Map<String, Object> emptyCoverage() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("basis", "all_results");
        m.put("by_book_key", new LinkedHashMap<>());
        m.put("total_seen", 0);
        m.put("at_cap", false);
        return m;
    }
}
