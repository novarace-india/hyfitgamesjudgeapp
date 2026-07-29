# Immediate RaceResult Penalty Sync Implementation Plan

1. Extract RaceResult URL construction and POST delivery into a shared,
   testable server module.
2. Change `POST /api/penalties` to persist the penalty first, immediately
   attempt its outbox operation, and return an explicit `confirmed`, `pending`,
   or `conflict` delivery state.
3. Make duplicate operation IDs resume delivery safely and keep failed
   operations durable for the worker.
4. Reuse the shared RaceResult request contract in the outbox worker.
5. Update the Judge App so it only shows confirmation after RR14 succeeds,
   retains pending operations for automatic retry, and permits local Final
   Finish during an internet outage.
6. Add automated coverage for URL construction, immediate confirmation,
   pending fallback, zero values, and existing demo behavior.
7. Run lint, production build/tests, database migration verification, and a
   database-backed delivery test against a controlled mock endpoint.
