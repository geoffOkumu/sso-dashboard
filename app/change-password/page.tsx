import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { HttpError } from "@/lib/http";
import { productName } from "@/lib/env";
import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";

export default async function Page() {
  let result;
  try {
    result = await requireUser(undefined, { allowPasswordChange: true });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      redirect("/sign-in");
    throw error;
  }
  if (!result.user.passwordChangeRequired) redirect("/");
  return (
    <AuthShell name={productName}>
      <AuthForm mode="initial-password" />
    </AuthShell>
  );
}
