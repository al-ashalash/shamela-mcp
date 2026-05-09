package ws.shamela.mcp;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.StoredFields;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;

/**
 * Open and cache Lucene readers for the page, book, and author indexes.
 * Single instance per JVM lifetime.
 */
public final class IndexCache implements AutoCloseable {

    private final Path storeRoot;
    private final Map<String, Entry> entries = new HashMap<>();

    private record Entry(Directory directory, DirectoryReader reader, IndexSearcher searcher, StoredFields stored) {}

    public IndexCache(Path databaseRoot) {
        this.storeRoot = databaseRoot.resolve("store");
    }

    public synchronized IndexSearcher searcher(String name) throws IOException {
        return entry(name).searcher;
    }

    public synchronized StoredFields storedFields(String name) throws IOException {
        return entry(name).stored;
    }

    public synchronized int numDocs(String name) throws IOException {
        return entry(name).reader.numDocs();
    }

    private Entry entry(String name) throws IOException {
        Entry e = entries.get(name);
        if (e != null) return e;
        Path indexPath = storeRoot.resolve(name);
        Directory dir = FSDirectory.open(Paths.get(indexPath.toString()));
        DirectoryReader reader = DirectoryReader.open(dir);
        IndexSearcher searcher = new IndexSearcher(reader);
        StoredFields stored = reader.storedFields();
        e = new Entry(dir, reader, searcher, stored);
        entries.put(name, e);
        return e;
    }

    @Override
    public synchronized void close() {
        for (Entry e : entries.values()) {
            try { e.reader.close(); } catch (IOException ignore) {}
            try { e.directory.close(); } catch (IOException ignore) {}
        }
        entries.clear();
    }
}
