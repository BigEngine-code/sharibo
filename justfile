# Sharibo — local verification recipes
#
# Prerequisites: everything listed in README.md §0 (Rust, stellar CLI,
# Node.js 20+, circom).
#
# Run `just --list` to see available recipes.  Any recipe can be run
# manually with the raw commands in README.md — `just` is optional.
# ── Doctor ───────────────────────────────────────────────────────────────────

# Run the toolchain doctor script (checks Rust, stellar CLI, Node, circom, just)
doctor:
    npm run doctor --workspace=scripts

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
