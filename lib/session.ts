import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { HttpError } from "./http";
export class PasswordChangeRequiredError extends HttpError {
  constructor() {
    super(403, "Change your temporary password before continuing");
  }
}
export async function requireUser(
  requestHeaders?: Headers,
  options: { allowPasswordChange?: boolean } = {},
) {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session) throw new HttpError(401, "Sign in to continue");
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (
    !user ||
    user.status !== "ACTIVE" ||
    user.securityVersion !== session.session.securityVersion
  )
    throw new HttpError(401, "Your session has expired or was revoked");
  if (user.passwordChangeRequired && !options.allowPasswordChange)
    throw new PasswordChangeRequiredError();
  return { user, session: session.session };
}
export async function requireAdmin(requestHeaders?: Headers) {
  const result = await requireUser(requestHeaders);
  if (result.user.globalRole !== "SUPERADMIN")
    throw new HttpError(403, "Superadmin access required");
  if (!result.user.twoFactorEnabled)
    throw new HttpError(403, "Enroll in MFA before administering Permit Kit");
  return result;
}
