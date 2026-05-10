#!/usr/bin/env node
/**
 * Cut a release: pack the .mcpb, tag the commit, and publish a GitHub Release
 * with the .mcpb attached.
 *
 * Pre-flight checks (any failure aborts before anything is written):
 *   1. Working tree clean (no staged or unstaged changes).
 *   2. On `main` branch.
 *   3. Local main is up to date with `origin/main`.
 *   4. manifest.json.version === package.json.version (single source of truth).
 *   5. Tag `v<VERSION>` does NOT already exist locally or on origin.
 *   6. There are commits since the last `v*` tag (refuses to release if HEAD
 *      already === last released tag).
 *   7. Vitest suite passes (`npm run test`).
 *   8. `gh` CLI is on PATH and authenticated.
 *
 * Then:
 *   - `npm run pack` → produces shamela-mcp-<VERSION>.mcpb
 *   - `git tag -a v<VERSION> -m "release v<VERSION>"`
 *   - `git push origin v<VERSION>`
 *   - `gh release create v<VERSION> shamela-mcp-<VERSION>.mcpb \
 *        --title "v<VERSION>" --generate-notes`
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

step("1/8  Working tree must be clean");
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

step("2/8  On main branch");
{
    const r = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = r.stdout.trim();
    if (branch !== "main") {
        fail(`On branch '${branch}'. Switch to main before releasing.`);
    }
    ok(`branch=${branch}`);
}

step("3/8  Up to date with origin/main");
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

step("4/8  manifest.json and package.json versions match");
ok(`both at ${VERSION}`);

step(`5/8  Tag ${TAG} does not already exist`);
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

step("6/8  HEAD has commits since the last release tag");
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

step("7/8  Vitest suite passes");
if (SKIP_TESTS) {
    console.log("  ⚠ skipped via --skip-tests");
} else {
    run("npm", ["run", "test"]);
    ok("all tests green");
}

step("8/8  gh CLI installed and authenticated");
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
    [
        "release",
        "create",
        TAG,
        mcpbPath,
        "--title",
        TAG,
        "--generate-notes",
    ],
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
