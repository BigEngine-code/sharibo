# Issue #62 — Return richer transaction results (ledger, fee, success link)

## Steps

- [x] Plan approved by user
- [ ] 1. Edit `packages/client/src/contract.ts` — Extend `TxResult<T>`, populate from `getTransactionResponse`, add `explorerTxUrl` helper
- [ ] 2. Edit `packages/client/src/index.ts` — Export `explorerTxUrl`
- [ ] 3. Edit `app/src/App.tsx` — Use SDK `explorerTxUrl`, display ledger number on claim result card
- [ ] 4. Typecheck — Verify `tsc --noEmit` passes in both packages
