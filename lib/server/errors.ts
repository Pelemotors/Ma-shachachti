import { messageForCode } from "../errors";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}

export function fail(e: unknown, requestId?: string) {
  if (e instanceof ApiError)
    return Response.json(
      { error: e.message, code: e.code, requestId },
      { status: e.status },
    );
  if (e instanceof Error && e.name === "ZodError")
    return Response.json(
      {
        error: messageForCode("invalid_input"),
        code: "invalid_input",
        requestId,
      },
      { status: 400 },
    );
  console.error("Request failed", {
    requestId,
    error: e instanceof Error ? e.name : "unknown",
  });
  return Response.json(
    {
      error: messageForCode("internal_error"),
      code: "internal_error",
      requestId,
    },
    { status: 500 },
  );
}
