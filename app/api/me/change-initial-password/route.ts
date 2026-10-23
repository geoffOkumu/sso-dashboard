import { requireUser } from "@/lib/session";
import { handle, json, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { changeInitialPassword } from "@/lib/user-password";
import { changeInitialPasswordInput } from "@/lib/validation";

export async function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const { user, session } = await requireUser(request.headers, {
      allowPasswordChange: true,
    });
    await rateLimit(`initial-password:${user.id}`, 10);
    const input = changeInitialPasswordInput.parse(await request.json());
    return json(await changeInitialPassword(user.id, session.id, input));
  });
}
