package ws.shamela.mcp;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.lucene.index.IndexReader;
import org.apache.lucene.index.Term;

/**
 * «ال» on the author-name path.
 *
 * The author index stores whole words, so «الموفق» and «موفق» are two terms and
 * an AND over the literal ones cannot reach a biography that spells the laqab
 * the other way. Measured on this library: «الموفق المقدسي» returned one author
 * — a contemporary editor who died 1432 — while «موفق المقدسي», one definite
 * article apart, returned Ibn Qudamah (474) at rank 1, whose biography reads
 * «… الجماعيلي المقدسي ثم الدمشقيّ الحنبلي، أبو محمد، موفق الدين …». Nothing was
 * missing from the data; only the article stood between the two queries.
 *
 * So each token is asked for both ways. The danger is that OR-ing every token
 * with its toggle destroys the conjunction: «الله» strips to «له», which sits in
 * 1,453 of 3,190 biographies, and «عبد الله» then drifts from 1,160 hits toward
 * the 1,739 that «عبد» alone returns. Measured with the toggle unguarded it
 * lands at 1,377 — 79% of the way to vacuous.
 *
 * The guard is document frequency, not length. A length guard was measured and
 * rejected: it has to reach 4 characters to block «له», and that also blocks
 * «العز» → «عز», which is what takes «العز بن عبد السلام» from 2 hits with the
 * man absent to 15 with him first. With the df guard, over 35 measured author
 * queries the median widens 2.7%, 14 return exactly what they returned before,
 * and no query's intended scholar ranks lower than it did.
 */
public final class ArticleVariants {

    private ArticleVariants() {}

    private static final String AL = "ال";

    /** Below this a stem is a fragment, not a name: «ال» itself, «الي» → «ي». */
    static final int MIN_STEM = 2;

    /**
     * Share of the index above which a variant has stopped being a name and
     * become vocabulary, so its clause stops constraining. 5% of these 3,190
     * biographies is 160 documents: it admits «حافظ» (109), which is what makes
     * «الحافظ ابن حجر» find Ibn Hajar at all, and refuses «الشيخ» (658),
     * «فقيه» (276) and «له» (1,453). No answer measured here changes anywhere
     * between 110 and 275, so the exact figure is not load-bearing.
     */
    static final double MAX_SHARE = 0.05;

    /** «الموفق» ⇄ «موفق». null when the token has no usable toggle. */
    static String toggle(String token) {
        if (token == null || token.isEmpty()) return null;
        if (token.startsWith(AL)) {
            String stem = token.substring(AL.length());
            return stem.length() >= MIN_STEM ? stem : null;
        }
        return token.length() >= MIN_STEM ? AL + token : null;
    }

    /**
     * One SHOULD-group per token: the token as typed, plus its article toggle
     * when that toggle is a term this index actually holds and is discriminating
     * enough to keep.
     *
     * Requiring df &gt; 0 is what keeps a query with no Arabic in it answering
     * zero — «Ghazali» would otherwise gain the guaranteed-empty term
     * «الGhazali» — so the transliteration fallback in searchAuthors.ts still
     * fires on total_hits === 0.
     */
    static List<List<String>> forTokens(IndexReader reader, String field, List<String> tokens) throws IOException {
        int cap = (int) Math.round(MAX_SHARE * reader.numDocs());
        List<List<String>> out = new ArrayList<>(tokens.size());
        for (String tok : tokens) {
            List<String> group = new ArrayList<>(2);
            group.add(tok);
            String toggled = toggle(tok);
            if (toggled != null && !toggled.equals(tok)) {
                int df = reader.docFreq(new Term(field, toggled));
                if (df > 0 && df <= cap) group.add(toggled);
            }
            out.add(group);
        }
        return out;
    }

    /** Every term the query actually asked for, in order, for the highlighter. */
    static List<String> flatten(List<List<String>> groups) {
        List<String> out = new ArrayList<>();
        for (List<String> g : groups) {
            for (String t : g) if (!out.contains(t)) out.add(t);
        }
        return out;
    }
}
