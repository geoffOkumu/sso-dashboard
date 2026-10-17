"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Loader2, KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function AuthForm({
  mode,
  token,
  name,
}: {
  mode: "sign-in" | "reset" | "forgot" | "invitation" | "consent";
  token?: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [mfa, setMfa] = useState(false),
    [recovery, setRecovery] = useState(false);
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
        "sign-in": "Welcome back",
        forgot: "Forgot your password?",
        reset: "Choose a new password",
        invitation: "You're invited",
        consent: "Connect your account",
      }[mode];
  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-7 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white shadow-sm">
        <KeyRound size={22} className="text-primary" />
      </div>
      <h1 className="text-[28px] font-semibold tracking-[-.8px]">{heading}</h1>
      <p className="mb-8 mt-2 text-[13px] leading-6 text-muted-foreground">
        {mfa
          ? "Enter a code from your authenticator to continue."
          : mode === "sign-in"
            ? `Sign in to your ${name} workspace.`
            : mode === "invitation"
              ? "Set up your company account to get started. Already have an account? Sign in first and leave the password blank."
              : mode === "consent"
                ? "Allow this company application to use your name and email for sign-in."
                : "We'll help you securely access your account."}
      </p>
      {success ? (
        <div
          role="status"
          className="space-y-5 rounded-lg border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800"
        >
          <ShieldCheck size={22} />
          <p>{success}</p>
          <Link className="font-semibold underline" href="/sign-in">
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
          {!mfa && ["sign-in", "reset", "invitation"].includes(mode) && (
            <label className="block text-xs font-medium">
              <span className="flex items-center justify-between">
                Password
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
                aria-label="Password"
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
            </label>
          )}
          {mfa && (
            <label className="block text-xs font-medium">
              {recovery ? "Recovery code" : "Authentication code"}
              <Input
                name="code"
                required
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
              <Button variant="outline" type="submit">
                Deny
              </Button>
            </div>
          ) : (
            <Button disabled={busy} className="h-10 w-full" type="submit">
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  {mfa
                    ? "Verify and continue"
                    : mode === "sign-in"
                      ? "Sign in"
                      : mode === "forgot"
                        ? "Send reset link"
                        : mode === "reset"
                          ? "Update password"
                          : "Accept invitation"}
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          )}
          {mfa && (
            <button
              type="button"
              className="text-xs text-primary"
              onClick={() => setRecovery(!recovery)}
            >
              {recovery ? "Use authenticator code" : "Use a recovery code"}
            </button>
          )}
        </form>
      )}
      <div className="mt-8 border-t border-border pt-6 text-center text-xs leading-6 text-muted-foreground">
        {mode === "sign-in" ? (
          <>New to the team? Ask your administrator for an invitation.</>
        ) : (
          <Link href="/sign-in" className="text-primary">
            Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
