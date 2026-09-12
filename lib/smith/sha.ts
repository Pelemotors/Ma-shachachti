const EXACT_SHA = /^[0-9a-f]{40}$/;

export function isExactGitSha(value: unknown): value is string {
  return typeof value === "string" && EXACT_SHA.test(value);
}

export function requireExactGitSha(value: unknown): string {
  if (!isExactGitSha(value)) {
    throw new Error("Smith requires an exact lowercase 40-character Git SHA.");
  }
  return value;
}

export function evidenceMatchesSha(
  currentSha: string,
  evidenceSha: string | null | undefined,
) {
  return isExactGitSha(currentSha) && evidenceSha === currentSha;
}
