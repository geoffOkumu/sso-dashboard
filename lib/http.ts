import { ZodError } from "zod";
import { isAPIError } from "better-auth/api";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const noStore = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
};
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: noStore });
}
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (isAPIError(error))
      return json(
        {
          error:
            error.body?.message ||
            error.body?.error_description ||
            "Authentication request rejected",
        },
        error.statusCode,
      );
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["P2002", "P2003", "P2025", "P2034"].includes(String(error.code))
    )
      return json(
        {
          error:
            "This change conflicts with existing data. Refresh and try again.",
        },
        409,
      );
    // Deliberately do not log request bodies, provider errors, tokens or credentials.
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error: "The service could not complete this request. Please try again.",
      },
      503,
    );
  }
}
export function sameOrigin(request: Request) {
  const expected = new URL(
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
  ).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "Invalid request origin");
}
