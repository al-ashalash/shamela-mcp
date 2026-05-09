package ws.shamela.mcp;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Long-lived helper subprocess. Reads JSON commands one per line from stdin,
 * dispatches, writes JSON responses one per line to stdout. Stderr is
 * available for diagnostic logging — the Node side surfaces it through
 * Claude Desktop's logs.
 *
 * Invocation:
 *   java -cp <Shamela jars + this jar> ws.shamela.mcp.Main &lt;install_root&gt;
 *
 * Exits cleanly on stdin EOF.
 */
public final class Main {

    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("usage: java ws.shamela.mcp.Main <install_root>");
            System.exit(2);
        }
        Path installRoot = Paths.get(args[0]);
        Path databaseRoot = installRoot.resolve("database");
        Path masterDb = databaseRoot.resolve("master.db");

        // Open stdout in unbuffered mode and force UTF-8 to avoid mojibake on Windows.
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);

        IndexCache indexCache;
        Catalog catalog;
        BookPages bookPages;
        try {
            indexCache = new IndexCache(databaseRoot);
            catalog = new Catalog(masterDb);
            bookPages = new BookPages(databaseRoot);
        } catch (Exception e) {
            // Pre-startup failure: emit a single error line and exit so the
            // Node side surfaces it via the spawn-error path.
            out.println(Json.encode(Json.obj(
                    "id", "startup",
                    "ok", false,
                    "error", Json.obj(
                            "code", "STARTUP_FAILED",
                            "message", e.getClass().getSimpleName() + ": " + e.getMessage())
            )));
            System.exit(1);
            return;
        }

        // Ready signal — useful for diagnostics; Node ignores unknown ids.
        Map<String, Object> ready = Json.obj(
                "id", "ready",
                "ok", true,
                "data", Json.obj(
                        "java_version", System.getProperty("java.version"),
                        "books_indexed", catalog.bookCount(),
                        "authors_indexed", catalog.authorCount(),
                        "page_docs", safeNumDocs(indexCache, "page"))
        );
        out.println(Json.encode(ready));

        try (BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null) {
                if (line.isEmpty()) continue;
                Map<String, Object> response = dispatch(line, indexCache, catalog, bookPages);
                out.println(Json.encode(response));
                out.flush();
            }
        } catch (Exception e) {
            System.err.println("[helper] fatal: " + e);
        } finally {
            indexCache.close();
            bookPages.close();
        }
    }

    private static int safeNumDocs(IndexCache c, String name) {
        try { return c.numDocs(name); } catch (Exception e) { return -1; }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> dispatch(
            String line,
            IndexCache indexCache,
            Catalog catalog,
            BookPages bookPages
    ) {
        Map<String, Object> req;
        try {
            req = Json.decodeObject(line);
        } catch (Exception e) {
            return error(null, "BAD_JSON", e.getMessage());
        }
        Object id = req.get("id");
        try {
            String cmd = String.valueOf(req.get("cmd"));
            Object argsObj = req.get("args");
            Map<String, Object> args = argsObj instanceof Map ? (Map<String, Object>) argsObj : new LinkedHashMap<>();
            Object data = switch (cmd) {
                case "ping" -> Json.obj(
                        "pong", Boolean.TRUE,
                        "java_version", System.getProperty("java.version"),
                        "books_indexed", catalog.bookCount(),
                        "authors_indexed", catalog.authorCount(),
                        "page_docs", safeNumDocs(indexCache, "page")
                );
                case "search_pages" -> SearchPages.run(
                        indexCache, catalog, bookPages,
                        asString(args.get("query")), asInt(args.get("max_results"), 20));
                case "search_books" -> SearchBooks.run(
                        indexCache, catalog,
                        asString(args.get("query")), asInt(args.get("max_results"), 20));
                case "search_authors" -> SearchAuthors.run(
                        indexCache, catalog,
                        asString(args.get("query")), asInt(args.get("max_results"), 20));
                default -> throw new IllegalArgumentException("unknown command: " + cmd);
            };
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("id", id);
            resp.put("ok", Boolean.TRUE);
            resp.put("data", data);
            return resp;
        } catch (IllegalArgumentException e) {
            return error(id, "BAD_ARG", e.getMessage());
        } catch (Exception e) {
            return error(id, "INTERNAL", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private static Map<String, Object> error(Object id, String code, String message) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("id", id);
        resp.put("ok", Boolean.FALSE);
        resp.put("error", Json.obj("code", code, "message", message == null ? "" : message));
        return resp;
    }

    private static String asString(Object o) {
        return o == null ? "" : o.toString();
    }

    private static int asInt(Object o, int defaultValue) {
        if (o == null) return defaultValue;
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(o.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private Main() {}
}
