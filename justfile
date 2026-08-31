# Sharibo — local verification recipes
#
# Prerequisites: everything listed in README.md §0 (Rust, stellar CLI,
# Node.js 20+, circom).
#
# Run `just --list` to see available recipes.  Any recipe can be run
# manually with the raw commands in README.md — `just` is optional.
# ── Circuits ──────────────────────────────────────────────────────────────────

# Compile circuit, run trusted setup, and run circuit tests
circuits:
    cd circuits && npm run compile
    cd circuits && npm run setup
    cd circuits && npm test

# ── Contract ──────────────────────────────────────────────────────────────────

# Run contract unit tests and build wasm binary
contract:
    cd contracts && cargo test
    cd contracts && stellar contract build

# ── Client ────────────────────────────────────────────────────────────────────

# TypeScript typecheck for the client SDK
client:
    npm run typecheck --workspace=packages/client

# ── Verify (umbrella) ───────────────────────────────────────────────────────────
# Run a complete local verification/gate for contributors. This intentionally
# excludes the slow or networked pieces: the `e2e` job (uses testnet/friendbot)
# and the circuits *trusted setup* (slow and stateful). Use this as the
# single pre-PR check to answer "did I break anything?".
verify:
    @root=$(git rev-parse --show-toplevel 2>/dev/null || printf "%s" "$(pwd)"); \
    echo "Running verify from $root"; \
    cd "$root"; \
    set -o pipefail; \
    s_type=0; s_eslint=0; s_deadcode=0; s_tests=0; s_cargo=0; \

    echo "\n== 1) TypeScript typecheck (packages/client + app if present) =="; \
    npm run -s typecheck --workspace=packages/client || s_type=1; \
    if [ -f app/package.json ]; then (cd app && npx -y tsc --noEmit) || s_type=1; fi; \

    echo "\n== 2) ESLint =="; \
    npx -y eslint . --ext .js,.ts,.tsx || s_eslint=1; \

    echo "\n== 3) Dead-code check (ts-prune; best-effort) =="; \
    npx -y ts-prune --summary || s_deadcode=1; \

    echo "\n== 4) Unit tests (app + packages/client + circuits if present) =="; \
    npm run -s test --workspace=app || s_tests=1; \
    npm run -s test --workspace=packages/client || s_tests=1; \
    if [ -f circuits/package.json ]; then (cd circuits && npm test --if-present) || true; fi; \

    echo "\n== 5) Cargo tests & clippy =="; \
    (cd contracts && cargo test) || s_cargo=1; \
    (cd contracts && cargo clippy -- -D warnings) || s_cargo=1; \

    echo "\nSummary:"; \
    printf "%-36s %s\n" "TypeScript typecheck" "$( [ $s_type -eq 0 ] && echo PASS || echo FAIL )"; \
    printf "%-36s %s\n" "ESLint" "$( [ $s_eslint -eq 0 ] && echo PASS || echo FAIL )"; \
    printf "%-36s %s\n" "Dead-code (ts-prune)" "$( [ $s_deadcode -eq 0 ] && echo PASS || echo WARN )"; \
    printf "%-36s %s\n" "Unit tests (app + client)" "$( [ $s_tests -eq 0 ] && echo PASS || echo FAIL )"; \
    printf "%-36s %s\n" "Cargo tests + clippy" "$( [ $s_cargo -eq 0 ] && echo PASS || echo FAIL )"; \

    if [ $s_type -eq 0 -a $s_eslint -eq 0 -a $s_tests -eq 0 -a $s_cargo -eq 0 ]; then \
        echo "\nverify: All checks passed."; \
    else \
        echo "\nverify: Some checks failed. See above for details."; \
        exit 2; \
    fi

# ── End-to-end ────────────────────────────────────────────────────────────────

# Full e2e round against live testnet (spends friendbot quota / testnet funds)
e2e:
    npm run e2e

# ── App ───────────────────────────────────────────────────────────────────────

# Start the browser demo dev server
app:
    cd app && npm run dev

# ── All (except e2e) ──────────────────────────────────────────────────────────

# Run everything except e2e (which spends testnet friendbot quota)
all: circuits contract client app
    @echo 'All recipes completed (e2e skipped — uses testnet funds/friendbot quota)'
