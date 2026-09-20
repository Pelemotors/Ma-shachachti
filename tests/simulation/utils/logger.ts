export type SimulationLogLevel = "debug" | "info" | "warning" | "failure";

export type SimulationLog = {
  level: SimulationLogLevel;
  runId: string;
  sequence: number;
  simulatedAt: string;
  category: string;
  message: string;
};

export function formatSimulationLog(entry: SimulationLog): string {
  return JSON.stringify({
    level: entry.level,
    runId: entry.runId,
    sequence: entry.sequence,
    simulatedAt: entry.simulatedAt,
    category: entry.category,
    message: entry.message,
  });
}

const LEVEL_RANK: Record<SimulationLogLevel, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  failure: 40,
};

function minLevel(): SimulationLogLevel {
  const raw = process.env.SIMULATION_LOG_LEVEL ?? "warning";
  return raw in LEVEL_RANK ? (raw as SimulationLogLevel) : "warning";
}

export function logSimulation(entry: SimulationLog): void {
  if (LEVEL_RANK[entry.level] < LEVEL_RANK[minLevel()]) return;
  const line = formatSimulationLog(entry);
  if (entry.level === "failure") {
    console.error(line);
    return;
  }
  if (entry.level === "warning") {
    console.warn(line);
    return;
  }
  console.log(line);
}
