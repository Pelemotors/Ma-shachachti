/**
 * Production Agent surfaces — architecture map, not an intent taxonomy.
 * A surface only records which UI capability the user opened.
 */
export const AGENT_SURFACES = [
  "chat",
  "memory",
  "planning",
  "focus",
  "free_time",
  "first_scan",
] as const;

export type AgentSurface = (typeof AGENT_SURFACES)[number];

export const AGENT_SURFACE_SET = new Set<string>(AGENT_SURFACES);

export function isAgentSurface(value: unknown): value is AgentSurface {
  return typeof value === "string" && AGENT_SURFACE_SET.has(value);
}
