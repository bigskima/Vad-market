# @vad/types

Dependency-free wire and domain types shared by VAD clients and trusted server
runtimes. This package describes contracts; it does not calculate eligibility,
fees, balances, settlement, or any other business decision.

`database.types.ts` may be generated into `src/` by the root `db:types` script.
Generated database types are deliberately not re-exported here until a schema
has been linked and generated successfully.
