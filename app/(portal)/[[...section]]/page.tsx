import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { productName } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { Portal } from "@/components/portal";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  if (
    section &&
    (section.length !== 1 ||
      ![
        "account",
        "security",
        "overview",
        "users",
        "platforms",
        "access",
        "audit",
        "settings",
      ].includes(section[0]))
  )
    notFound();
  let result;
  try {
    result = await requireUser();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      redirect("/sign-in");
    throw error;
  }
  const { user } = result;
  return (
    <Portal
      productName={productName}
      initialUser={{
        id: user.id,
        name: user.name,
        email: user.email,
        globalRole: user.globalRole,
        twoFactorEnabled: !!user.twoFactorEnabled,
      }}
    />
  );
}
