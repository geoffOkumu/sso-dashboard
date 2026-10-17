import { AuthShell } from "@/components/auth-shell";
import { AuthForm } from "@/components/auth-form";
import { productName } from "@/lib/env";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell name={productName}>
      <AuthForm mode="consent" token={token} name={productName} />
    </AuthShell>
  );
}
