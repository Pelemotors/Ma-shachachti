import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const target = resolve(process.env.SIMULATION_RESULTS_DIR ?? "test-results/simulation");
const root = resolve(".");
if (!target.startsWith(root) || !target.includes("test-results")) {
  console.error("Refusing to clean a path outside test-results/simulation.");
  process.exit(1);
}
if (existsSync(target)) {
  for (const name of readdirSync(target)) {
    if (name === "README.md") continue;
    rmSync(join(target, name), { recursive: true, force: true });
  }
} else {
  writeFileSync(
    join(target, "README.md"),
    "# Simulation run artifacts\n\nThis directory holds local harness output only.\n",
    "utf8",
  );
}
console.log(`Cleaned ${target}`);
