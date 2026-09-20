import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const personaDir = join(import.meta.dirname, "..", "personas");
const scenarioRoots = ["daily", "weekly", "edge-cases", "regression"].map((name) =>
  join(import.meta.dirname, "..", "scenarios", name),
);

function catalogEmpty(): boolean {
  const personaFiles = existsSync(personaDir)
    ? readdirSync(personaDir).filter((name) => name.endsWith(".json"))
    : [];
  const scenarioFiles = scenarioRoots.flatMap((dir) =>
    existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")) : [],
  );
  return personaFiles.length === 0 && scenarioFiles.length === 0;
}

const positional = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const persona = arg("persona") ?? positional[0];
const scenario = arg("scenario") ?? positional[1];
const seed = arg("seed") ?? positional[2];

if (catalogEmpty() || !persona || !scenario) {
  console.log(
    [
      "Simulation catalog is not ready.",
      "No product Personas or Scenarios have been added yet.",
      "Use `npm run simulation:smoke` to verify the engine.",
      persona ? `Requested persona: ${persona}` : "No --persona provided.",
      scenario ? `Requested scenario: ${scenario}` : "No --scenario provided.",
      seed ? `Requested seed: ${seed}` : "Default seed will come from SIMULATION_SEED later.",
    ].join("\n"),
  );
  process.exit(0);
}

console.log("Catalog entries exist but product runner wiring is reserved for the next batch.");
process.exit(1);
