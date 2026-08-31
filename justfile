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

# Verify: run lint and client checks
verify: client
    npm run lint

# Run coverage for all workspaces and print a short per-workspace summary.
# This is a local instrument (not a merge gate). It runs each workspace's
# test command with coverage enabled and emits the report locations.
coverage:
    @echo 'Collecting coverage for: app, packages/client, scripts, contracts'
    # App (vitest will write to coverage/app)
    cd app && npm test || true
    # Client (vitest will write to coverage/packages-client)
    npm run test --workspace=packages/client || true
    # Scripts (node --test may be used by the scripts workspace)
    npm run test --workspace=scripts || true
    # Contracts (cargo-llvm-cov must be installed; see contracts/README.md)
    cd contracts && cargo llvm-cov --workspace --tests --lcov --output-path coverage || true
    @echo
    @echo 'Summary:'
    @printf '%-25s %-12s %s\n' "Workspace" "Report" "Notes"
    @printf '%-25s %-12s %s\n' "app" "coverage/app" "vitest + v8"
    @printf '%-25s %-12s %s\n' "packages/client" "coverage/packages-client" "vitest + v8"
    @printf '%-25s %-12s %s\n' "scripts" "(scripts test may output coverage)" "node --test"
    @printf '%-25s %-12s %s\n' "contracts" "contracts/coverage" "cargo llvm-cov (HTML/lcov)"
