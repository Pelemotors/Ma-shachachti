# Simulation harness

Deterministic, isolated test infrastructure for "מה שכחתי?".

The harness is **not** a product feature, a second agent, or a second source of truth. It drives the real product (API → Agent → domain → DB) and measures what happened.

## Layers

| Layer | Role |
| --- | --- |
| Persona | Who the user is. Stable traits only. |
| Scenario | What happens. Ordered events over virtual time. |
| Runner | When and how events fire. |
| Actions | How a user action is sent through the product. |
| Validators | Hard correctness. PASS/FAIL only. |
| Evaluators | Behavioral quality metrics. No thresholds yet. |
| Reporter | Evidence on disk. Never mutates product state. |

## Virtual clock

The engine never waits real hours. `VirtualClock` is injected into every runner/action/validator. Simulated time and wall-clock metadata (`realRunTime`) are stored separately.

## Seed and replay

Every run takes an integer seed. The same git SHA + persona + scenario + seed must produce the same **normalized** output (timeline without wall-clock duration).

## Safety

`SIMULATION_ENV=production` is refused. There is no quiet bypass. Dedicated test credentials only. Secrets are redacted before any artifact is written.

## Commands

```bash
npm run simulation:doctor
npm run simulation:test
npm run simulation:smoke
npm run simulation:run
npm run simulation:clean
```

`simulation:run` will not invent a persona. The catalog is empty until the next batch.

## Results

Artifacts land in `test-results/simulation/<run-id>/` and are gitignored.

## Adding personas later

1. Add a JSON/TS document under `personas/` that passes `persona.schema.ts`.
2. Add a scenario under `scenarios/{daily,weekly,edge-cases,regression}/`.
3. Run `npm run simulation:run -- --persona <id> --scenario <id> --seed 1001`.
