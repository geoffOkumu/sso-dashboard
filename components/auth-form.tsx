"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ShieldCheck, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function AuthForm({
  mode,
  token,
}: {
  mode:
    | "sign-in"
    | "reset"
    | "forgot"
    | "invitation"
    | "consent"
    | "initial-password";
  token?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [signInHref, setSignInHref] = useState("/sign-in"),
    [mfa, setMfa] = useState(false),
    [mfaMethod, setMfaMethod] = useState<"totp" | "email" | "recovery">("totp"),
    [emailNotice, setEmailNotice] = useState("");
  const recovery = mfaMethod === "recovery";
  function changeMfaMethod(method: typeof mfaMethod) {
    setMfaMethod(method);
    setError("");
    setEmailNotice("");
  }
  async function requestEmailCode() {
    setBusy(true);
    setError("");
    setEmailNotice("");
    try {
      const result = await authClient.twoFactor.sendOtp({ trustDevice: false });
      if (result.error)
        throw new Error(
          result.error.message || "Could not send the email code.",
        );
      setMfaMethod("email");
      setEmailNotice(
        "Code sent to your account email. It expires in 3 minutes.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not send the email code. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "invitation") {
        const response = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            name: form.get("name"),
            password: form.get("password") || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSuccess("Invitation accepted. You can now sign in.");
      } else if (mode === "initial-password") {
        if (form.get("password") !== form.get("confirmPassword"))
          throw new Error("New passwords do not match");
        const response = await fetch("/api/me/change-initial-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: form.get("currentPassword"),
            newPassword: form.get("password"),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSignInHref(`/sign-in${window.location.search}`);
        setSuccess("Password updated. Sign in with your new password.");
      } else if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email: String(form.get("email")),
          redirectTo: "/reset-password",
        });
        if (result.error) throw new Error(result.error.message);
        setSuccess(
          "If this account exists, a password reset link is on its way.",
        );
      } else if (mode === "reset") {
        const result = await authClient.resetPassword({
          token: token || "",
          newPassword: String(form.get("password")),
        });
        if (result.error) throw new Error(result.error.message);
        setSuccess("Password updated. Sign in with your new password.");
      } else if (mode === "consent") {
        const result = await authClient.oauth2.consent({
          accept: form.get("accept") === "yes",
        });
        if (result.error) throw new Error(result.error.message);
        if (result.data?.url) window.location.assign(result.data.url);
      } else if (mfa) {
        const result = recovery
          ? await authClient.twoFactor.verifyBackupCode({
              code: String(form.get("code")),
            })
          : mfaMethod === "email"
            ? await authClient.twoFactor.verifyOtp({
                code: String(form.get("code")).trim(),
                trustDevice: false,
              })
            : await authClient.twoFactor.verifyTotp({
                code: String(form.get("code")),
                trustDevice: false,
              });
        if (result.error) throw new Error(result.error.message);
        const destination =
          result.data &&
          "url" in result.data &&
          typeof result.data.url === "string"
            ? result.data.url
            : "/";
        window.location.assign(destination);
      } else {
        const result = await authClient.signIn.email({
          email: String(form.get("email")),
          password: String(form.get("password")),
          callbackURL: "/",
        });
        if (result.error) throw new Error(result.error.message);
        if (
          result.data &&
          "twoFactorRedirect" in result.data &&
          result.data.twoFactorRedirect
        )
          setMfa(true);
        else if (result.data?.url) window.location.assign(result.data.url);
        else window.location.assign("/");
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const heading = mfa
    ? "Verify it's you"
    : {
        "sign-in": "Sign in",
        forgot: "Forgot your password?",
        reset: "Choose a new password",
        "initial-password": "Change your temporary password",
        invitation: "You're invited",
        consent: "Connect your account",
      }[mode];
  return (
    <div className="w-full">
      <h1 className="text-center text-2xl font-semibold tracking-tight">
        {heading}
      </h1>
      <p className="mb-7 mt-2 text-center text-[13px] leading-5 text-muted-foreground">
        {mfa
          ? recovery
            ? "Enter one of your recovery codes."
            : mfaMethod === "email"
              ? "Enter the six-digit code sent to your account email."
              : "Enter a code from your authenticator."
          : mode === "sign-in"
            ? "Continue with your account."
            : mode === "invitation"
              ? "Create your account to continue."
              : mode === "consent"
                ? "Share your name and email with this app to sign in."
                : mode === "initial-password"
                  ? "Replace your temporary password to continue."
                  : mode === "forgot"
                    ? "We'll email you a reset link."
                    : "Use at least 12 characters."}
      </p>
      {success ? (
        <div
          role="status"
          className="space-y-5 rounded-lg border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800"
        >
          <ShieldCheck size={22} />
          <p>{success}</p>
          <Link className="font-semibold underline" href={signInHref}>
            Continue to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700"
            >
              {error}
            </div>
          )}
          {emailNotice && (
            <p
              role="status"
              className="text-xs leading-5 text-muted-foreground"
            >
              {emailNotice}
            </p>
          )}
          {mode === "invitation" && (
            <label className="block text-xs font-medium">
              Full name
              <Input
                name="name"
                autoComplete="name"
                required
                className="mt-2"
                placeholder="Your full name"
              />
            </label>
          )}
          {!mfa && ["sign-in", "forgot"].includes(mode) && (
            <label className="block text-xs font-medium">
              Work email
              <Input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-2"
                placeholder="you@company.com"
              />
            </label>
          )}
          {mode === "initial-password" && (
            <label className="block text-xs font-medium">
              Temporary password
              <Input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                className="mt-2"
              />
            </label>
          )}
          {!mfa &&
            ["sign-in", "reset", "invitation", "initial-password"].includes(
              mode,
            ) && (
              <label className="block text-xs font-medium">
                <span className="flex items-center justify-between">
                  {mode === "initial-password" ? "New password" : "Password"}
                  {mode === "sign-in" && (
                    <Link
                      href="/forgot-password"
                      className="font-normal text-primary"
                    >
                      Forgot password?
                    </Link>
                  )}
                </span>
                <Input
                  aria-label={
                    mode === "initial-password" ? "New password" : "Password"
                  }
                  name="password"
                  type="password"
                  required={mode !== "invitation"}
                  minLength={mode === "sign-in" ? 1 : 12}
                  maxLength={128}
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  className="mt-2"
                  placeholder={
                    mode === "sign-in"
                      ? "Enter your password"
                      : "At least 12 characters"
                  }
                />
                {mode === "invitation" && (
                  <span className="mt-2 block font-normal leading-5 text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                      href="/sign-in"
                      className="text-primary hover:underline"
                    >
                      Sign in
                    </Link>{" "}
                    first, then leave this blank.
                  </span>
                )}
              </label>
            )}
          {mode === "initial-password" && (
            <label className="block text-xs font-medium">
              Confirm new password
              <Input
                name="confirmPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                className="mt-2"
              />
            </label>
          )}
          {mfa && (
            <label className="block text-xs font-medium">
              {recovery
                ? "Recovery code"
                : mfaMethod === "email"
                  ? "Email code"
                  : "Authentication code"}
              <Input
                key={mfaMethod}
                name="code"
                required
                disabled={busy}
                inputMode={recovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                className="mt-2"
                placeholder={recovery ? "Enter a recovery code" : "000000"}
              />
            </label>
          )}
          {mode === "consent" ? (
            <div className="flex gap-3">
              <Button
                type="submit"
                name="accept"
                value="yes"
                disabled={busy}
                className="h-11 flex-1 shadow-none"
                onClick={(e) => {
                  const input = document.createElement("input");
                  input.type = "hidden";
                  input.name = "accept";
                  input.value = "yes";
                  e.currentTarget.form?.append(input);
                }}
              >
                Allow access
              </Button>
              <Button
                variant="outline"
                type="submit"
                disabled={busy}
                className="h-11 flex-1 shadow-none"
              >
                Deny
              </Button>
            </div>
          ) : (
            <Button
              disabled={busy}
              className="h-11 w-full shadow-none"
              type="submit"
            >
              {busy ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Please wait…
                </>
              ) : (
                <>
                  {mfa
                    ? "Verify and continue"
                    : mode === "sign-in"
                      ? "Sign in"
                      : mode === "forgot"
                        ? "Send reset link"
                        : mode === "reset" || mode === "initial-password"
                          ? "Update password"
                          : "Accept invitation"}
                </>
              )}
            </Button>
          )}
          {mfa && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={busy}
                className="block w-full text-center text-xs text-primary hover:underline disabled:opacity-50"
                onClick={() => void requestEmailCode()}
              >
                {mfaMethod === "email"
                  ? "Send a new email code"
                  : "Email me a code"}
              </button>
              {mfaMethod !== "totp" && (
                <button
                  type="button"
                  disabled={busy}
                  className="block w-full text-center text-xs text-primary hover:underline disabled:opacity-50"
                  onClick={() => changeMfaMethod("totp")}
                >
                  Use authenticator code
                </button>
              )}
              {!recovery && (
                <button
                  type="button"
                  disabled={busy}
                  className="block w-full text-center text-xs text-primary hover:underline disabled:opacity-50"
                  onClick={() => changeMfaMethod("recovery")}
                >
                  Use a recovery code
                </button>
              )}
            </div>
          )}
        </form>
      )}
      {mode !== "sign-in" && mode !== "consent" && !success && (
        <div className="mt-6 text-center text-xs">
          <Link href="/sign-in" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      )}
    </div>
  );
}
