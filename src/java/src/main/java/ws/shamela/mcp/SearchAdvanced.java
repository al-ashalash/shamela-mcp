package ws.shamela.mcp;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.lucene.index.Term;
import org.apache.lucene.queries.intervals.Intervals;
import org.apache.lucene.queries.intervals.IntervalQuery;
import org.apache.lucene.queries.intervals.IntervalsSource;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.ConstantScoreQuery;
import org.apache.lucene.search.PhraseQuery;
import org.apache.lucene.search.Query;

/**
 * Phrase, proximity and boolean search asked of the engine itself.
 *
 * These three questions used to be answered in two stages outside it: fetch a
 * bounded window of pages where the words merely co-occur, then re-read each
 * one and check the words' arrangement. The arrangement test was exact, but the
 * window was not — a phrase common enough to appear in tens of thousands of
 * pages was judged from the first hundred, and the answer was a sample
 * presented with a footnote saying so.
 *
 * The engine can answer all three directly. Shamela's index records where each
 * word sits on a page, not merely that it is there, so adjacency and proximity
 * are index operations; and exclusion is a clause the index understands rather
 * than a set subtraction over whatever the window happened to hold. Measured
 * against the local library — 1.1 million pages — an exhaustive phrase count
 * returns in well under a second, so the window bought nothing but its own
 * inaccuracy.
 *
 * What still cannot move here is exactness: diacritics, hamza shapes and digit
 * systems are folded away by the analyzer before a word reaches the index, so
 * `search_exact` must keep reading the page text to honour them.
 */
public final class SearchAdvanced {

    private SearchAdvanced() {}

    /**
     * Words the near query may skip past, on top of the words asked for.
     *
     * `distance` is how many words may sit between the query's words, which is
     * the way a reader thinks about it; Lucene measures the whole span instead,
     * so the words themselves are added back.
     */
    private static int spanWidth(int distance, int termCount) {
        return Math.max(termCount, distance + termCount);
    }

    /**
     * Run a phrase or proximity search over the page index.
     *
     * @param mode     "phrase" for consecutive words, "near" for words within
     *                 `distance` of each other in any order
     * @param distance ignored for "phrase"
     */
    public static Map<String, Object> runPhrase(
            IndexCache indexCache,
            String rawQuery,
            String mode,
            int distance,
            List<String> scopeBookKeys,
            int maxResults,
            int offset,
            List<String> searchIn
    ) throws IOException {
        Normalize.QueryTokens parsed = Normalize.normalizeQueryDetailed(rawQuery, Normalize.Variant.PAGE);
        List<String> tokens = parsed.tokens();
        List<String> fields = fieldsOf(searchIn);
        boolean near = "near".equals(mode);

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("query", rawQuery == null ? "" : rawQuery);
        envelope.put("normalized_tokens", tokens);
        envelope.put("dropped_tokens", parsed.dropped());
        envelope.put("mode", near ? "near" : "phrase");
        envelope.put("distance", distance);
        envelope.put("offset", offset);

        // A phrase needs at least two words to be a phrase; one word is an
        // ordinary search and is answered as one rather than refused.
        if (tokens.isEmpty()) return empty(envelope, scopeBookKeys);

        BooleanQuery.Builder acrossFields = new BooleanQuery.Builder();
        acrossFields.setMinimumNumberShouldMatch(1);
        for (String field : fields) {
            Query sub = tokens.size() == 1
                    ? new org.apache.lucene.search.TermQuery(new Term(field, tokens.get(0)))
                    : near ? nearQuery(field, tokens, distance) : phraseQuery(field, tokens);
            acrossFields.add(sub, BooleanClause.Occur.SHOULD);
        }

        Query q = withScope(acrossFields.build(), scopeBookKeys);
        // What a phrase search found is the phrase, so that is what the snippet
        // marks. Highlighting its words one by one marks every «لا» on the page
        // for a query like «لا ضرر ولا ضرار» — the words are all there, and the
        // reader cannot see which run of them was the match. Proximity keeps
        // the per-word marks: its words are deliberately apart.
        boolean asPhrase = !near && tokens.size() > 1;
        return SearchPages.execute(indexCache, null, q, envelope,
                asPhrase ? List.of(String.join(" ", tokens)) : tokens,
                asPhrase ? tokens : null,
                null, fields, scopeBookKeys, maxResults, offset, false, true);
    }

    /**
     * Run a boolean search: every `allOf` term present, at least one `anyOf`
     * term present, no `noneOf` term present.
     *
     * Each term is itself AND-searched across its own words, which is what the
     * tool has always promised: a multi-word term must co-occur.
     */
    public static Map<String, Object> runBoolean(
            IndexCache indexCache,
            List<String> allOf,
            List<String> anyOf,
            List<String> noneOf,
            List<String> scopeBookKeys,
            int maxResults,
            int offset,
            List<String> searchIn
    ) throws IOException {
        List<String> fields = fieldsOf(searchIn);

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("all_of", allOf == null ? List.of() : allOf);
        envelope.put("any_of", anyOf == null ? List.of() : anyOf);
        envelope.put("none_of", noneOf == null ? List.of() : noneOf);
        envelope.put("offset", offset);

        BooleanQuery.Builder outer = new BooleanQuery.Builder();
        // The tokens of every positive term, for highlighting: a hit is shown
        // with whichever of the asked-for words it actually carries.
        List<String> highlightTokens = new ArrayList<>();
        // Term -> its words, so each hit can say which terms it carries.
        Map<String, List<String>> termGroups = new LinkedHashMap<>();
        // Words the five-word cap left out of any term, so the answer can say
        // it searched for less than it was asked for.
        List<String> dropped = new ArrayList<>();
        boolean anyPositive = false;

        for (String term : nullToEmpty(allOf)) {
            Query sub = termQuery(term, fields, highlightTokens, termGroups, dropped);
            if (sub == null) continue;
            outer.add(sub, BooleanClause.Occur.MUST);
            anyPositive = true;
        }

        List<Query> anySubs = new ArrayList<>();
        for (String term : nullToEmpty(anyOf)) {
            Query sub = termQuery(term, fields, highlightTokens, termGroups, dropped);
            if (sub != null) anySubs.add(sub);
        }
        if (!anySubs.isEmpty()) {
            BooleanQuery.Builder any = new BooleanQuery.Builder();
            any.setMinimumNumberShouldMatch(1);
            for (Query sub : anySubs) any.add(sub, BooleanClause.Occur.SHOULD);
            outer.add(any.build(), BooleanClause.Occur.MUST);
            anyPositive = true;
        }

        // Exclusion is exhaustive here, which it could not be outside the
        // engine: a page is excluded because the index says it holds the word,
        // not because the word turned up in the window that was fetched.
        for (String term : nullToEmpty(noneOf)) {
            Query sub = termQuery(term, fields, null, null, dropped);
            if (sub != null) outer.add(sub, BooleanClause.Occur.MUST_NOT);
        }

        envelope.put("dropped_tokens", dropped);

        // A search that only says what it does not want has no result set to
        // subtract from; asking the index for every page is not what was meant.
        if (!anyPositive) return empty(envelope, scopeBookKeys);

        Query q = withScope(outer.build(), scopeBookKeys);
        return SearchPages.execute(indexCache, null, q, envelope, highlightTokens, null, termGroups, fields,
                scopeBookKeys, maxResults, offset, false, true);
    }

    /**
     * Search for GROUPS of words near one another, each group held together.
     *
     * `runPhrase(mode="near")` puts every word of the query into one unordered
     * window, which is right for a proximity search and wrong for a scan: it
     * cannot ask for «لا خلاف» AS A PHRASE near a subject. Measured on this
     * library, {@code {query:"لا خلاف المسح", mode:"near", distance:20}}
     * returns 162 pages and not one of the first sixty carries «لا خلاف» at
     * all — «لا» sits on 833,185 of 1,111,817 pages and contributes nothing,
     * and among the pages returned are ones recording a DISAGREEMENT. A scan
     * built on that would report the opposite of what its own witnesses say.
     *
     * Here each group keeps its shape — one word, an adjacent phrase, or an
     * ordered run with up to `gap` words allowed inside it, which is what
     * collapses «لا نعلم خلافا», «لا نعلم فيه خلافا» and «لا أعلم خلافا» into
     * one query — and the groups are then required within one window of each
     * other.
     *
     * Each group is normalised SEPARATELY. Normalize.normalizeQuery caps a
     * query at five words and glues the overflow into the last one, so a
     * three-word formula joined to a three-word subject would silently become a
     * term no index holds and the whole scan would read zero.
     *
     * The FIRST group is the one the witness snippet opens on; a scan passes
     * the formula first, because the formula is what it is showing evidence of.
     *
     * `group_totals` is each group's own count in the same scope, taken here
     * because the searcher is already open. Without it a reader compares a
     * formula's count across schools and measures house idiom rather than
     * dispute: «وجهان» is 32,334 pages of Shafii fiqh and 198 of Maliki.
     */
    public static Map<String, Object> runNearGroups(
            IndexCache indexCache,
            List<String> groups,
            List<Integer> groupGaps,
            int distance,
            List<String> scopeBookKeys,
            int maxResults,
            int offset,
            List<String> searchIn,
            boolean wantCoverage
    ) throws IOException {
        List<String> fields = fieldsOf(searchIn);
        List<List<String>> normalized = new ArrayList<>();
        List<String> allTokens = new ArrayList<>();
        List<String> dropped = new ArrayList<>();
        for (String group : nullToEmpty(groups)) {
            Normalize.QueryTokens parsed = Normalize.normalizeQueryDetailed(group, Normalize.Variant.PAGE);
            List<String> toks = parsed.tokens();
            dropped.addAll(parsed.dropped());
            normalized.add(toks);
            allTokens.addAll(toks);
        }

        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("groups", nullToEmpty(groups));
        envelope.put("normalized_groups", normalized);
        envelope.put("normalized_tokens", allTokens);
        envelope.put("dropped_tokens", dropped);
        envelope.put("distance", distance);
        envelope.put("offset", offset);

        // A group that normalises to nothing would silently drop its own
        // constraint, turning a two-group question into a one-group one.
        if (normalized.isEmpty() || normalized.stream().anyMatch(List::isEmpty)) {
            envelope.put("group_totals", List.of());
            return empty(envelope, scopeBookKeys);
        }

        BooleanQuery.Builder acrossFields = new BooleanQuery.Builder();
        acrossFields.setMinimumNumberShouldMatch(1);
        for (String field : fields) {
            acrossFields.add(groupsQuery(field, normalized, groupGaps, distance, allTokens.size()),
                    BooleanClause.Occur.SHOULD);
        }
        Query q = withScope(acrossFields.build(), scopeBookKeys);

        // Each group alone, in the same scope: the base rate beside the count.
        List<Integer> groupTotals = new ArrayList<>(normalized.size());
        for (int i = 0; i < normalized.size(); i++) {
            BooleanQuery.Builder one = new BooleanQuery.Builder();
            one.setMinimumNumberShouldMatch(1);
            for (String field : fields) {
                one.add(groupQuery(field, normalized.get(i), gapAt(groupGaps, i)), BooleanClause.Occur.SHOULD);
            }
            groupTotals.add(indexCache.searcher(SearchPages.INDEX)
                    .count(withScope(one.build(), scopeBookKeys)));
        }
        envelope.put("group_totals", groupTotals);

        // The witness snippet is the deliverable of a scan, so the window has
        // to open on the FIRST group — which is why the first group is the
        // caller's contract here, and why a scan passes the formula first.
        //
        // Snippet.make centres on the earliest match anywhere in the page, so
        // handing it every group centred «لا خلاف» + «المسح» on whichever came
        // first — usually the subject, twenty words from the formula the reader
        // is being shown as evidence. Marking word by word was worse still: it
        // centred on the «خلاف» inside «بخلاف النحل», a page about bees offered
        // as evidence about a legal question. The remaining groups stay as the
        // fallback, so a formula the page spells differently still gets marked.
        // For a gapped group the whole joined phrase is usually NOT contiguous
        // on the matching page — that is what the gap exists for: «لا نعلم
        // خلافا» matches «لا نعلم فيه خلافا», where the three words never stand
        // together. The joined phrase then fails, the fallback marks every
        // token of every group, and the window opened on the subject or on a
        // stray «لا» far from the formula — witnesses quoting text that showed
        // none of what they were cited as evidence OF, in the majority of the
        // gapped formula's hits (adjacent: 257 pages; interrupted: ~1,400).
        // The first two tokens ARE contiguous in practice (the gap admits words
        // later in the run), so a gapped group hands those as its phrase.
        List<String> groupPhrases = new ArrayList<>(normalized.size());
        for (int i = 0; i < normalized.size(); i++) {
            List<String> group = normalized.get(i);
            int gap = gapAt(groupGaps, i);
            List<String> phraseTokens = gap > 0 && group.size() > 2 ? group.subList(0, 2) : group;
            groupPhrases.add(String.join(" ", phraseTokens));
        }
        return SearchPages.execute(indexCache, null, q, envelope,
                List.of(groupPhrases.get(0)), allTokens,
                null, fields, scopeBookKeys, maxResults, offset, false, wantCoverage);
    }

    // --- query construction -------------------------------------------------

    /** Words tolerated inside group `i`; absent means none, i.e. an exact phrase. */
    private static int gapAt(List<Integer> gaps, int i) {
        if (gaps == null || i >= gaps.size() || gaps.get(i) == null) return 0;
        return Math.max(0, gaps.get(i));
    }

    /** One group, held together: a word, an adjacent phrase, or a gapped run. */
    private static IntervalsSource groupSource(List<String> tokens, int gap) {
        if (tokens.size() == 1) return Intervals.term(tokens.get(0));
        IntervalsSource[] sources = new IntervalsSource[tokens.size()];
        for (int i = 0; i < tokens.size(); i++) sources[i] = Intervals.term(tokens.get(i));
        // Ordered, not unordered: «لا خلاف» and «خلاف لا» are not the same
        // claim, and the gap is what admits «لا نعلم فيه خلافا» beside
        // «لا نعلم خلافا» without admitting a page that merely holds both words.
        return gap == 0 ? Intervals.phrase(sources) : Intervals.maxgaps(gap, Intervals.ordered(sources));
    }

    private static Query groupQuery(String field, List<String> tokens, int gap) {
        return new IntervalQuery(field, groupSource(tokens, gap));
    }

    private static Query groupsQuery(
            String field, List<List<String>> groups, List<Integer> gaps, int distance, int totalTokens) {
        if (groups.size() == 1) return groupQuery(field, groups.get(0), gapAt(gaps, 0));
        IntervalsSource[] sources = new IntervalsSource[groups.size()];
        for (int i = 0; i < groups.size(); i++) sources[i] = groupSource(groups.get(i), gapAt(gaps, i));
        IntervalsSource unordered = Intervals.unordered(sources);
        return new IntervalQuery(field, Intervals.maxwidth(spanWidth(distance, totalTokens), unordered));
    }


    private static Query phraseQuery(String field, List<String> tokens) {
        PhraseQuery.Builder b = new PhraseQuery.Builder();
        for (int i = 0; i < tokens.size(); i++) b.add(new Term(field, tokens.get(i)), i);
        return b.build();
    }

    private static Query nearQuery(String field, List<String> tokens, int distance) {
        List<IntervalsSource> sources = new ArrayList<>(tokens.size());
        for (String t : tokens) sources.add(Intervals.term(t));
        IntervalsSource unordered = Intervals.unordered(sources.toArray(new IntervalsSource[0]));
        return new IntervalQuery(field, Intervals.maxwidth(spanWidth(distance, tokens.size()), unordered));
    }

    /** One boolean term: all its words, anywhere on the page, in any field. */
    private static Query termQuery(
            String term, List<String> fields, List<String> collectTokens, Map<String, List<String>> groups,
            List<String> dropped) {
        Normalize.QueryTokens parsed = Normalize.normalizeQueryDetailed(term, Normalize.Variant.PAGE);
        List<String> tokens = parsed.tokens();
        if (dropped != null) dropped.addAll(parsed.dropped());
        if (tokens.isEmpty()) return null;
        if (collectTokens != null) collectTokens.addAll(tokens);
        if (groups != null) groups.put(term, tokens);
        BooleanQuery.Builder all = new BooleanQuery.Builder();
        for (String tok : tokens) {
            BooleanQuery.Builder acrossFields = new BooleanQuery.Builder();
            acrossFields.setMinimumNumberShouldMatch(1);
            for (String field : fields) {
                acrossFields.add(new org.apache.lucene.search.TermQuery(new Term(field, tok)),
                        BooleanClause.Occur.SHOULD);
            }
            all.add(acrossFields.build(), BooleanClause.Occur.MUST);
        }
        return all.build();
    }

    private static Query withScope(Query main, List<String> scopeBookKeys) {
        if (scopeBookKeys == null || scopeBookKeys.isEmpty()) return new ConstantScoreQuery(main);
        BooleanQuery.Builder withScope = new BooleanQuery.Builder();
        withScope.add(main, BooleanClause.Occur.MUST);
        withScope.add(QueryBuilder.scopeQuery(scopeBookKeys), BooleanClause.Occur.MUST);
        return new ConstantScoreQuery(withScope.build());
    }

    // --- shared bits --------------------------------------------------------

    /** Same fields an ordinary page search would read, so the two agree. */
    private static List<String> fieldsOf(List<String> searchIn) {
        return SearchPages.effectiveFields(searchIn);
    }

    private static List<String> nullToEmpty(List<String> in) {
        return in == null ? List.of() : in;
    }

    private static Map<String, Object> empty(Map<String, Object> envelope, List<String> scopeBookKeys) {
        envelope.put("total_hits", 0);
        envelope.put("returned", 0);
        envelope.put("has_more", false);
        envelope.put("scope_count", scopeBookKeys == null ? -1 : scopeBookKeys.size());
        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("by_book_key", new LinkedHashMap<>());
        coverage.put("total_seen", 0);
        coverage.put("at_cap", false);
        coverage.put("basis", "all_results");
        envelope.put("coverage", coverage);
        envelope.put("results", List.of());
        return envelope;
    }
}
