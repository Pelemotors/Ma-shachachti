export function chooseSurfaceTurnId(
  input: {
    retry: boolean;
    previousStatus: string;
    previousTurnId: string | null;
  },
  createId: () => string = () => crypto.randomUUID(),
) {
  if (
    input.retry &&
    input.previousStatus === "error" &&
    input.previousTurnId
  ) {
    return input.previousTurnId;
  }
  return createId();
}
