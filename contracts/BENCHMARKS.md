# Contract CPU benchmarks

This table is refreshed by the benchmark test:

```bash
just bench-contract
```

The committed values are generated from the current Soroban SDK and should be
reviewed whenever contract logic or dependencies change.

| Entrypoint | CPU instructions | Budget headroom |
| --- | ---: | ---: |
| `create_circle` | pending refresh | pending refresh |
| `fund` | pending refresh | pending refresh |
| `claim` | pending refresh | pending refresh |
| `verify_groth16` (5 public inputs) | pending refresh | pending refresh |

`claim` must remain below 80,000,000 instructions. Stellar's transaction CPU
budget is 100,000,000 instructions.
