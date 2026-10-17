import { z } from "zod";
import { auth } from "@/lib/auth";
import { acceptInvitation } from "@/lib/invitations";
import { handle, json, sameOrigin } from "@/lib/http";
import { rateLimit, requestAddress } from "@/lib/rate-limit";
const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(128).optional(),
});
export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    await rateLimit(`invitation:${requestAddress(request)}`, 10);
    const input = schema.parse(await request.json());
    const session = await auth.api.getSession({ headers: request.headers });
    return json(
      await acceptInvitation(
        input,
        session?.user.emailVerified ? session.user.id : undefined,
      ),
    );
  });
}
