import { auth } from "@/lib/auth";
import { handle } from "@/lib/http";
import { rateLimit, requestAddress } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
  return handle(async () => {
    const path = new URL(request.url).pathname;
    if (
      request.method === "POST" &&
      /sign-in|password|two-factor|oauth2\/token/.test(path)
    )
      await rateLimit(
        `auth:${requestAddress(request)}:${path}`,
        path.endsWith("/token") ? 60 : 10,
      );
    const response = await auth.handler(request);
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  });
}
export { handler as GET, handler as POST };
