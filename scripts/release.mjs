#!/usr/bin/env node
/**
 * Cut a release: pack the .mcpb, tag the commit, and publish a GitHub Release
 * with the .mcpb attached.
 *
 * Pre-flight checks (any failure aborts before anything is written):
 *   1. Working tree clean (no staged or unstaged changes).
 *   2. On `main` branch.
 *   3. Local main is up to date with `origin/main`.
 *   4. All six version references agree with manifest.json (the single source
 *      of truth), and all twelve landing-page languages carry every block.
 *   5. Tag `v<VERSION>` does NOT already exist locally or on origin.
 *   6. There are commits since the last `v*` tag (refuses to release if HEAD
 *      already === last released tag).
 *   7. Vitest suite passes (`npm run test`).
 *   8. `gh` CLI is on PATH and authenticated.
 *   9. docs/release-notes/v<VERSION>.md exists, opens with an H1 title, and is
 *      written in Arabic. Release notes are prose for a reader, not generated.
 *
 * Then:
 *   - `npm run pack` → produces shamela-mcp-<VERSION>.mcpb
 *   - `git tag -a v<VERSION> -m "release v<VERSION>"`
 *   - `git push origin v<VERSION>`
 *   - `gh release create v<VERSION> shamela-mcp-<VERSION>.mcpb \
 *        --title "<H1 of docs/release-notes/v<VERSION>.md>" --notes-file <its body>`
 *
 * Flags:
 *   --dry-run    Run all pre-flight checks but skip pack/tag/publish.
 *   --skip-tests Skip step 7. Use only if you've just run the suite manually.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
process.chdir(repoRoot);

const isWin = os.platform() === "win32";
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const SKIP_TESTS = args.has("--skip-tests");

// --- Helpers ---------------------------------------------------------------

const SHIMS = new Set(["npm", "npx", "gh"]);
function run(cmd, argv, opts = {}) {
    const useShell = isWin && SHIMS.has(cmd);
    const r = spawnSync(cmd, argv, {
        stdio: opts.capture ? "pipe" : "inherit",
        encoding: "utf8",
        ...opts,
        shell: useShell,
    });
    if (r.status !== 0 && !opts.allowFailure) {
        const tail = opts.capture ? `\n${r.stdout ?? ""}\n${r.stderr ?? ""}` : "";
        throw new Error(
            `${cmd} ${argv.join(" ")} failed (exit ${r.status}, signal ${r.signal})${tail}`,
        );
    }
    return r;
}

function git(argv, opts = {}) {
    return run("git", argv, { capture: true, ...opts });
}

function fail(msg) {
    console.error(`\n✗ ${msg}\n`);
    process.exit(1);
}

function ok(msg) {
    console.log(`  ✓ ${msg}`);
}

function step(msg) {
    console.log(`\n▸ ${msg}`);
}

// --- Read versions ---------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const VERSION = manifest.version;
const TAG = `v${VERSION}`;

if (!VERSION) fail("manifest.json has no version field.");
if (pkg.version !== VERSION) {
    fail(
        `Version mismatch: manifest.json says ${VERSION} but package.json says ${pkg.version}. ` +
            `Bump both to the same value.`,
    );
}

console.log(`\nReleasing shamela-mcp ${TAG}${DRY_RUN ? " (DRY RUN)" : ""}\n`);
console.log("=".repeat(60));

// --- Pre-flight ------------------------------------------------------------

step("1/9  Working tree must be clean");
{
    const r = git(["status", "--porcelain"]);
    if (r.stdout.trim()) {
        fail(
            "Uncommitted changes present:\n" +
                r.stdout +
                "\nCommit or stash before releasing.",
        );
    }
    ok("clean");
}

step("2/9  On main branch");
{
    const r = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = r.stdout.trim();
    if (branch !== "main") {
        fail(`On branch '${branch}'. Switch to main before releasing.`);
    }
    ok(`branch=${branch}`);
}

step("3/9  Up to date with origin/main");
{
    git(["fetch", "origin", "main"]);
    const ahead = git(["rev-list", "--count", "origin/main..HEAD"]).stdout.trim();
    const behind = git(["rev-list", "--count", "HEAD..origin/main"]).stdout.trim();
    if (Number(behind) > 0) {
        fail(`Local main is ${behind} commits behind origin/main. Pull first.`);
    }
    if (Number(ahead) > 0) {
        fail(
            `Local main is ${ahead} commits ahead of origin/main. Push first ` +
                `so the tag points at a published commit.`,
        );
    }
    ok("synced with origin");
}

step("4/9  Every version reference and every landing language agree");
{
    // This step used to compare manifest.json against package.json and stop.
    // Those two are the easy pair — they sit next to each other and get edited
    // together. The version also lives in constants.ts, the README and the
    // landing badge, and it is the far ones that rot: 1.3.0 shipped with 2.0.0
    // still printed on the landing page, because CI ran this check and the
    // release command did not.
    run("node", [path.join(repoRoot, "scripts", "check-versions.mjs")]);
    run("node", [path.join(repoRoot, "scripts", "check-landing-langs.mjs")]);
    ok(`all references at ${VERSION}, all twelve languages complete`);
}

step(`5/9  Tag ${TAG} does not already exist`);
{
    const local = git(["tag", "-l", TAG]).stdout.trim();
    if (local) {
        fail(
            `Tag ${TAG} already exists locally. Either bump the version in ` +
                `manifest.json + package.json, or delete the tag with ` +
                `\`git tag -d ${TAG}\` (NOT recommended if it's already on origin).`,
        );
    }
    const remote = git([
        "ls-remote",
        "--tags",
        "origin",
        `refs/tags/${TAG}`,
    ]).stdout.trim();
    if (remote) {
        fail(
            `Tag ${TAG} already exists on origin. A release was already cut ` +
                `from this version. Bump the version in manifest.json + package.json ` +
                `before re-running.`,
        );
    }
    ok(`${TAG} is unused`);
}

step("6/9  HEAD has commits since the last release tag");
{
    const allTags = git(["tag", "-l", "v*", "--sort=-v:refname"]).stdout.trim().split("\n").filter(Boolean);
    if (allTags.length === 0) {
        ok("no prior releases — first release");
    } else {
        const lastTag = allTags[0];
        const headSha = git(["rev-parse", "HEAD"]).stdout.trim();
        const tagSha = git(["rev-parse", `${lastTag}^{}`]).stdout.trim();
        if (headSha === tagSha) {
            fail(
                `HEAD is the same commit as the last release tag ${lastTag}. ` +
                    `There's nothing new to release. If you have unreleased work, ` +
                    `commit it; if not, this version is already shipped.`,
            );
        }
        const commitCount = git([
            "rev-list",
            "--count",
            `${lastTag}..HEAD`,
        ]).stdout.trim();
        ok(`${commitCount} commit(s) since ${lastTag}`);
        const summary = git([
            "log",
            `${lastTag}..HEAD`,
            "--oneline",
            "--no-merges",
        ]).stdout.trim();
        if (summary) {
            console.log("\n  Commits since last release:");
            for (const line of summary.split("\n").slice(0, 20)) {
                console.log(`    ${line}`);
            }
            if (summary.split("\n").length > 20) {
                console.log(`    ... (${summary.split("\n").length - 20} more)`);
            }
            console.log("");
        }
    }
}

step("7/9  Vitest suite passes");
if (SKIP_TESTS) {
    console.log("  ⚠ skipped via --skip-tests");
} else {
    run("npm", ["run", "test"]);
    ok("all tests green");
}

step("8/9  gh CLI installed and authenticated");
{
    const ver = run("gh", ["--version"], { capture: true, allowFailure: true });
    if (ver.status !== 0) {
        fail(
            "gh CLI not on PATH. Install with `winget install GitHub.cli` " +
                "(Windows) or `brew install gh` (macOS). Then run `gh auth login`.",
        );
    }
    const auth = run("gh", ["auth", "status"], {
        capture: true,
        allowFailure: true,
    });
    if (auth.status !== 0) {
        fail("gh CLI is installed but not authenticated. Run `gh auth login`.");
    }
    ok(ver.stdout.split("\n")[0].trim());
}

// --- 9/9  Release notes ----------------------------------------------------
//
// v1.3.0 published with `--generate-notes`, which produced an English list of
// pull-request titles. That is wrong twice over. The readers of this project are
// Arabic-speaking, and every release before it was written in Arabic; and the
// generated list described only the PRs, so it missed the four new tools
// entirely — the release's whole substance — while announcing the maintainer as
// a first-time contributor to his own repository.
//
// The notes are prose about a library, in the language of the people who use it.
// They are written, not generated. This refuses to publish without them rather
// than quietly falling back to something the maintainer would have to go and fix
// on a page users are already reading.
step("9/9  Release notes are written for this version");
const notesPath = path.join(repoRoot, "docs", "release-notes", `${TAG}.md`);
let releaseTitle = TAG;
let notesBodyPath = "";
{
    if (!fs.existsSync(notesPath)) {
        fail(
            `No release notes at docs/release-notes/${TAG}.md.\n\n` +
                `  Write them in Arabic, as prose for a reader — what changed for someone\n` +
                `  using the library, not a list of commits. docs/release-notes/v1.3.0.md is\n` +
                `  the model. Put the release title on the first line as an H1:\n\n` +
                `      # ${TAG} — <عنوان عربي موجز>\n`,
        );
    }
    const raw = fs.readFileSync(notesPath, "utf8");
    const firstLine = raw.split(/\r?\n/)[0] ?? "";
    if (!firstLine.startsWith("# ")) {
        fail(
            `docs/release-notes/${TAG}.md must open with an H1 giving the release title, ` +
                `e.g. "# ${TAG} — <عنوان>". Found: ${JSON.stringify(firstLine.slice(0, 60))}`,
        );
    }
    releaseTitle = firstLine.slice(2).trim();
    if (!/[؀-ۿ]/.test(raw)) {
        fail(
            `docs/release-notes/${TAG}.md contains no Arabic. Releases are written in ` +
                `Arabic — see docs/release-notes/v1.3.0.md.`,
        );
    }
    // The body is everything after the title line; gh renders the title itself.
    // Written outside the repo so a release can never leave a stray file behind
    // in a tree the next run insists must be clean.
    notesBodyPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "shamela-rel-")), "notes.md");
    fs.writeFileSync(notesBodyPath, raw.split(/\r?\n/).slice(1).join("\n").trimStart(), "utf8");
    ok(releaseTitle);
}

console.log("\n" + "=".repeat(60));
console.log("All pre-flight checks passed.");

if (DRY_RUN) {
    console.log("\n--dry-run: skipping pack/tag/publish.");
    process.exit(0);
}

// --- Pack ------------------------------------------------------------------

step("Packing .mcpb");
run("npm", ["run", "pack"]);

const mcpbPath = path.join(repoRoot, `shamela-mcp-${VERSION}.mcpb`);
if (!fs.existsSync(mcpbPath)) {
    fail(`Pack reported success but ${mcpbPath} is missing.`);
}
const sizeMb = (fs.statSync(mcpbPath).size / 1024 / 1024).toFixed(2);
ok(`${path.basename(mcpbPath)} (${sizeMb} MB)`);

// --- Tag + push ------------------------------------------------------------

step(`Creating local tag ${TAG}`);
run("git", ["tag", "-a", TAG, "-m", `release ${TAG}`], { capture: false });
ok(`tagged ${TAG}`);

step(`Pushing ${TAG} to origin`);
run("git", ["push", "origin", TAG], { capture: false });
ok(`pushed`);

// --- GitHub Release --------------------------------------------------------

step("Publishing GitHub Release");
run(
    "gh",
    ["release", "create", TAG, mcpbPath, "--title", releaseTitle, "--notes-file", notesBodyPath],
    { capture: false },
);

const url = run("gh", ["release", "view", TAG, "--json", "url", "--jq", ".url"], {
    capture: true,
    allowFailure: true,
}).stdout.trim();

console.log("\n" + "=".repeat(60));
console.log(`✓ Released shamela-mcp ${TAG}`);
if (url) console.log(`  ${url}`);
console.log("");
