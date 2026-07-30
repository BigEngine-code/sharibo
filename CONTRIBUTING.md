# Contributing to Sharibo

We're glad you're interested in contributing! Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## Development Setup

See [README.md](README.md#run-it) for full setup instructions.

## Pre-commit Hook (opt-in)

Sharibo can optionally run a pre-commit hook that scans staged files for accidentally-included
Stellar secret keys (`S…`). This helps prevent leaking secrets to a public repository.

### Install

```bash
bash scripts/install-hooks.sh
```

This symlinks `scripts/check-secrets.mjs` into `.git/hooks/pre-commit`.

### What it checks

1. **Stellar secret keys** — any text matching `S[A-Z2-7]{55}` in staged file contents.
2. **Env-style filenames** — files named `.env` or `.env.*` (e.g. `.env.backup`) in the staged list.

Contract IDs (`C…`) and public keys (`G…`) are intentionally **not** flagged.

### Bypass

If you need to commit something that triggers a false positive, skip the hook with:

```bash
git commit --no-verify
```

### Uninstall

```bash
rm .git/hooks/pre-commit
```

## Pull Request Process

1. Ensure your branch is based on the latest `main`.
2. Run relevant tests before opening a PR (see [README.md](README.md#tests)).
3. Link your PR to the issue it resolves (if applicable).
4. A maintainer will review your changes.
