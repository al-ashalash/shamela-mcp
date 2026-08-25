/**
 * A whole Shamela library, fabricated, in a temp folder.
 *
 * Everything this extension does that is NOT search goes through sql.js: the
 * catalogue in master.db, which books are on disk, scope resolution, the page
 * and title tables of each book, citation building. None of that needs a
 * Shamela install to be true — it needs FILES OF THE RIGHT SHAPE. So they are
 * made here, and those paths can be covered on a bare CI machine rather than
 * only on a maintainer's laptop.
 *
 * What is NOT here, and cannot be: the text. Page bodies, footnotes and chapter
 * titles live in Shamela's own Lucene indexes, written by Shamela and read by
 * our Java helper; the per-book SQLite file holds page ids and printed page
 * numbers and nothing a reader would read. That is why no set of freely
 * licensed books would make a search test runnable on a build machine — and it
 * is also why this fixture is safe. A library with no prose in it contains
 * nothing that could be mistaken for a classical work.
 *
 * Generated, not committed. A .db blob in git cannot be reviewed: a wrong
 * column type, or a real book title pasted in by someone being helpful, would
 * sit in the repository unreadable and unchallenged. As source, every string is
 * greppable and the test can ASSERT that each one is marked synthetic.
 *
 * The schema below is a snapshot of a real Shamela 4 install, and a snapshot
 * rots. It is guarded from both sides: the unit test reads it back out of the
 * GENERATED files, and an integration test reads it out of the REAL install.
 * Either half alone proves nothing; together they mean a schema change in
 * Shamela fails on a maintainer's machine before this fixture can start lying
 * to CI.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import initSqlJs, { type Database } from "sql.js";

import { getSqlWasm } from "./shared.js";

/** Every readable string in the fixture carries this. The test enforces it. */
export const SYNTH_MARK = "SYNTH-";

/**
 * The CREATE TABLE text of a real Shamela 4 install, whitespace-collapsed.
 * Verified against D:/shamela4 before this file was written.
 */
export const EXPECTED_SCHEMA = {
    master: [
        "CREATE TABLE author (author_id INTEGER PRIMARY KEY, author_name TEXT, death_number INTEGER, death_text TEXT, alpha INTEGER)",
        "CREATE TABLE author_book (author_id INTEGER, book_id INTEGER)",
        "CREATE TABLE book (book_id INTEGER PRIMARY KEY, book_name TEXT, book_category INTEGER, book_type INTEGER, book_date INTEGER, authors TEXT, main_author INTEGER, printed INTEGER, group_id INTEGER, hidden INTEGER, major_online INTEGER, minor_online INTEGER, major_ondisk INTEGER, minor_ondisk INTEGER, pdf_links TEXT, pdf_ondisk INTEGER, pdf_online INTEGER, cover_ondisk INTEGER, cover_online INTEGER, meta_data TEXT, parent INTEGER, alpha INTEGER, group_order INTEGER, book_up INTEGER)",
        "CREATE TABLE category (category_id INTEGER PRIMARY KEY, category_name TEXT, category_order INTEGER)",
        "CREATE TABLE coauthor_book (author_id INTEGER, book_id INTEGER)",
        "CREATE TABLE db_ver (value INTEGER)",
        "CREATE TABLE version (key TEXT, value INTEGER)",
    ],
    book: [
        "CREATE TABLE page (id INTEGER PRIMARY KEY, part TEXT, page INTEGER, number INTEGER, services TEXT)",
        "CREATE TABLE title (id INTEGER PRIMARY KEY, page INTEGER, parent INTEGER)",
    ],
    service: [
        "CREATE TABLE db_ver (value INTEGER)",
        "CREATE TABLE inservice (book INTEGER, user_excluded INTEGER)",
        "CREATE TABLE service (key_id INTEGER, book_id INTEGER, page_id INTEGER)",
    ],
} as const;

/**
 * The book ids, chosen for the bucket spellings they produce.
 *
 * The bucket folder is `id % 1000` padded to three digits, and getting that
 * padding wrong is issue #47 — every book whose remainder is under 100 became
 * unreadable. So the set covers a zero remainder, a single digit, a two-digit
 * one, and remainders that need no padding at all.
 */
export const SYN = {
    /** remainder 0 → bucket "000" */
    BUCKET_000: 1000,
    /** remainder 9 → bucket "009" */
    PADDED: 9,
    /** remainder 99 → bucket "099" */
    BUCKET_099: 99,
    /** remainder 442, needs no padding */
    PLAIN: 1442,
    /** two volumes */
    MULTI: 100,
    /** on disk, but its page table is empty */
    EMPTY: 555,
    /** flagged downloaded in the catalogue, with no file behind the flag */
    MISSING: 777,
    /** a file with no catalogue row */
    ORPHAN: 888,
    /** carries Shamela's 99999 "no date" sentinel in book_date */
    UNDATED: 1234,
    /**
     * Catalogued and NOT downloaded — the ordinary state of most of the
     * catalogue, and the one a maintainer's fully-downloaded machine can never
     * show. Filed under a madhhab so the coverage receipt can be asked what a
     * school's zero means when none of its books is here.
     */
    CATALOGUED_ONLY: 2014,
} as const;

export const SYN_AUTHOR = { DATED: 700001, UNDATED: 700002, COAUTHOR: 700003 } as const;
export const SYN_CATEGORY = { GENERAL: 1, HANAFI: 14, SHAFII: 16, HANBALI: 17 } as const;

export interface SyntheticLibrary {
    /** The `database/` folder, as the extension expects to be handed one. */
    database: string;
    cleanup: () => void;
}

const bucketOf = (id: number): string => String(id % 1000).padStart(3, "0");

function write(db: Database, file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(db.export()));
    db.close();
}

/**
 * One per-book database: page ids that are deliberately NOT dense, so a test
 * that assumes id === row number fails here rather than in someone's session.
 */
function makeBookDb(
    SQL: Awaited<ReturnType<typeof initSqlJs>>,
    rows: Array<{ id: number; part?: string | null; page: number; services?: string | null }>,
    titles: Array<{ id: number; page: number; parent: number }>,
): Database {
    const db = new SQL.Database();
    for (const ddl of EXPECTED_SCHEMA.book) db.run(ddl);
    for (const r of rows) {
        db.run("INSERT INTO page (id, part, page, number, services) VALUES (?, ?, ?, ?, ?)", [
            r.id,
            r.part ?? null,
            r.page,
            r.page,
            r.services ?? null,
        ]);
    }
    for (const t of titles) {
        db.run("INSERT INTO title (id, page, parent) VALUES (?, ?, ?)", [t.id, t.page, t.parent]);
    }
    return db;
}

/**
 * Build the library. Returns the `database/` path and a cleanup function; the
 * caller owns both.
 */
export async function createSyntheticLibrary(): Promise<SyntheticLibrary> {
    const SQL = await initSqlJs({ wasmBinary: getSqlWasm().buffer as ArrayBuffer });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shamela-synth-"));
    const database = path.join(root, "database");

    // ---- master.db ----------------------------------------------------
    const master = new SQL.Database();
    for (const ddl of EXPECTED_SCHEMA.master) master.run(ddl);

    const categories: Array<[number, string, number]> = [
        [SYN_CATEGORY.GENERAL, `${SYNTH_MARK}عام`, 1],
        [SYN_CATEGORY.SHAFII, `${SYNTH_MARK}شافعي`, 2],
        [SYN_CATEGORY.HANBALI, `${SYNTH_MARK}حنبلي`, 3],
        [SYN_CATEGORY.HANAFI, `${SYNTH_MARK}حنفي`, 4],
    ];
    for (const c of categories) {
        master.run("INSERT INTO category (category_id, category_name, category_order) VALUES (?, ?, ?)", c);
    }

    const authors: Array<[number, string, number, string]> = [
        [SYN_AUTHOR.DATED, `${SYNTH_MARK}مؤلف مؤرَّخ`, 700, "٧٠٠هـ"],
        // 99999 is Shamela's own sentinel for "no death year recorded".
        [SYN_AUTHOR.UNDATED, `${SYNTH_MARK}مؤلف بلا تاريخ`, 99999, ""],
        [SYN_AUTHOR.COAUTHOR, `${SYNTH_MARK}مشارك`, 0, ""],
    ];
    for (const a of authors) {
        master.run(
            "INSERT INTO author (author_id, author_name, death_number, death_text, alpha) VALUES (?, ?, ?, ?, 0)",
            a,
        );
    }

    /** book_id, name, category, date, authors CSV, main_author, flagged-on-disk, parts */
    const books: Array<[number, number, number, string, number, number]> = [
        [SYN.BUCKET_000, SYN_CATEGORY.GENERAL, 300, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 1],
        [SYN.PADDED, SYN_CATEGORY.SHAFII, 450, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 1],
        [SYN.BUCKET_099, SYN_CATEGORY.HANBALI, 620, String(SYN_AUTHOR.UNDATED), SYN_AUTHOR.UNDATED, 1],
        [SYN.PLAIN, SYN_CATEGORY.GENERAL, 800, String(SYN_AUTHOR.UNDATED), SYN_AUTHOR.UNDATED, 1],
        [SYN.MULTI, SYN_CATEGORY.SHAFII, 500, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 1],
        [SYN.EMPTY, SYN_CATEGORY.GENERAL, 0, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 1],
        [SYN.MISSING, SYN_CATEGORY.GENERAL, 0, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 1],
        // book_date 99999 — the same "no date" sentinel the author table uses.
        // It reached citations as «٩٩٩٩٩هـ» because only the author side was
        // being normalised.
        [SYN.UNDATED, SYN_CATEGORY.GENERAL, 99999, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 1],
        // Flag 0 and no file: the catalogue knows it, the disk does not.
        [SYN.CATALOGUED_ONLY, SYN_CATEGORY.HANAFI, 400, String(SYN_AUTHOR.DATED), SYN_AUTHOR.DATED, 0],
    ];
    for (const [id, cat, date, csv, main, ondisk] of books) {
        master.run(
            "INSERT INTO book (book_id, book_name, book_category, book_type, book_date, authors, main_author," +
                " printed, group_id, hidden, major_online, minor_online, major_ondisk, minor_ondisk," +
                " pdf_links, pdf_ondisk, pdf_online, cover_ondisk, cover_online, meta_data, parent, alpha," +
                " group_order, book_up) VALUES (?, ?, ?, 1, ?, ?, ?, 1, 0, 0, 1, 0, ?, 0, '', 0, 0, 0, 0, ?, 0, 0, 0, 0)",
            [id, `${SYNTH_MARK}كتاب ${id}`, cat, date, csv, main, ondisk, '{"date":"08121431"}'],
        );
        master.run("INSERT INTO author_book (author_id, book_id) VALUES (?, ?)", [main, id]);
    }
    // A co-author the `authors` CSV does not mention: the merge has to find it.
    master.run("INSERT INTO coauthor_book (author_id, book_id) VALUES (?, ?)", [
        SYN_AUTHOR.COAUTHOR,
        SYN.PADDED,
    ]);
    master.run("INSERT INTO db_ver (value) VALUES (4)");
    master.run("INSERT INTO version (key, value) VALUES ('schema', 4)");
    write(master, path.join(database, "master.db"));

    // ---- per-book databases -------------------------------------------
    // Ids are sparse on purpose: 80, 85, 91 rather than 1, 2, 3.
    const singleVolume = [
        { id: 80, page: 5, services: '{"ayat":[1,2]}' },
        { id: 85, page: 6 },
        { id: 91, page: 7, services: '{"hadeeth":[7]}' },
    ];
    const titles = [
        { id: 1, page: 80, parent: 0 },
        { id: 2, page: 85, parent: 1 },
        { id: 3, page: 91, parent: 0 },
    ];
    for (const id of [SYN.BUCKET_000, SYN.PADDED, SYN.BUCKET_099, SYN.PLAIN]) {
        write(
            makeBookDb(SQL, singleVolume, titles),
            path.join(database, "book", bucketOf(id), `${id}.db`),
        );
    }
    // Two volumes, so the printed label reads "1/ 7" rather than a bare number.
    write(
        makeBookDb(
            SQL,
            [
                { id: 10, part: "1", page: 7 },
                { id: 11, part: "1", page: 8 },
                { id: 20, part: "2", page: 3 },
            ],
            [{ id: 1, page: 10, parent: 0 }],
        ),
        path.join(database, "book", bucketOf(SYN.MULTI), `${SYN.MULTI}.db`),
    );
    // Present, catalogued, and empty — the "downloaded but nothing to read" case.
    write(makeBookDb(SQL, [], []), path.join(database, "book", bucketOf(SYN.EMPTY), `${SYN.EMPTY}.db`));
    // A file with no catalogue row behind it.
    write(
        makeBookDb(SQL, [{ id: 1, page: 1 }], []),
        path.join(database, "book", bucketOf(SYN.ORPHAN), `${SYN.ORPHAN}.db`),
    );
    // SYN.MISSING gets no file at all: the flag says downloaded, the disk does not.

    // ---- service databases --------------------------------------------
    for (const svc of ["tafseer", "hadeeth", "trajim"]) {
        const db = new SQL.Database();
        for (const ddl of EXPECTED_SCHEMA.service) db.run(ddl);
        if (svc === "tafseer") {
            db.run("INSERT INTO service (key_id, book_id, page_id) VALUES (262, ?, 85)", [SYN.PADDED]);
            db.run("INSERT INTO inservice (book, user_excluded) VALUES (?, 0)", [SYN.PADDED]);
        }
        db.run("INSERT INTO db_ver (value) VALUES (4)");
        write(db, path.join(database, "service", `${svc}.db`));
    }

    return {
        database,
        cleanup: () => {
            try {
                fs.rmSync(root, { recursive: true, force: true });
            } catch {
                /* best-effort */
            }
        },
    };
}
