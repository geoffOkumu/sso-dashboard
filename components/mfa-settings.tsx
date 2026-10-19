"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { authClient } from "@/lib/auth-client";
import { ErrorNotice, Field, Panel } from "./portal-shared";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Me } from "./portal-types";

type Step = "password" | "connect" | "recovery" | "done";
type Enrollment = { totpURI: string; backupCodes: string[] };

export function MfaSettings({ me, refresh }: { me: Me; refresh: () => void }) {
  const [step, setStep] = useState<Step>("password");
  const [setup, setSetup] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const enabled = enabledOverride ?? me.user.twoFactorEnabled;
  const setupKey = setup
    ? new URL(setup.totpURI).searchParams.get("secret") || ""
    : "";

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  async function submit(
    e: FormEvent<HTMLFormElement>,
    action: "enable" | "verify" | "disable",
  ) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "enable") {
        const result = await authClient.twoFactor.enable({
          password: String(fields.get("password")),
        });
        if (result.error) throw new Error(result.error.message);
        if (result.data.method !== "totp")
          throw new Error(
            "Authenticator setup is unavailable. Please try again.",
          );
        form.reset();
        setSetup(result.data);
        setCode("");
        setStep("connect");
      } else if (action === "verify") {
        if (!setup) return;
        const result = await authClient.twoFactor.verifyTotp({ code });
        if (result.error)
          throw new Error(
            result.error.code === "INVALID_CODE"
              ? "That code could not be verified. Enter the latest six-digit code from your authenticator and try again."
              : result.error.message ||
                  "Verification failed. Please try again.",
          );
        setRecoveryCodes(setup.backupCodes);
        setSetup(null);
        setCode("");
        setSaved(false);
        setEnabledOverride(true);
        setStep("recovery");
        refresh();
      } else {
        const result = await authClient.twoFactor.disable({
          password: String(fields.get("password")),
        });
        if (result.error) throw new Error(result.error.message);
        form.reset();
        setEnabledOverride(false);
        setSetup(null);
        setRecoveryCodes([]);
        setStep("password");
        setNotice("MFA has been disabled.");
        refresh();
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "MFA update failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    setNotice("");
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError(
        "Copy is unavailable in this browser. Select and copy the text manually.",
      );
    }
  }

  function downloadCodes() {
    const text = `Permit Kit recovery codes\nAccount: ${me.user.email}\n\nEach code can be used once. Store these somewhere private.\n\n${recoveryCodes.join("\n")}\n`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "permit-kit-recovery-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Recovery codes downloaded. Keep the file somewhere private.");
  }

  return (
    <Panel className="mb-6 p-4 sm:p-6">
      <div className="mb-5 flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Smartphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">
              Multi-factor authentication
            </h2>
            <Badge tone={enabled ? "green" : "amber"}>
              {enabled
                ? "Enabled"
                : setup
                  ? "Setup in progress"
                  : "Not configured"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            {enabled
              ? "Your account is protected with an authenticator app."
              : "Add another layer of protection with an authenticator app."}
            {me.user.globalRole === "SUPERADMIN" &&
              " Required for all superadmins."}
          </p>
        </div>
      </div>

      {(!enabled || step === "recovery") && (
        <ol
          aria-label="MFA setup progress"
          className="mb-6 grid grid-cols-3 gap-2"
        >
          {(
            ["Confirm password", "Connect app", "Save recovery codes"] as const
          ).map((label, index) => {
            const current =
              step === "password" ? 0 : step === "connect" ? 1 : 2;
            return (
              <li
                key={label}
                aria-current={current === index ? "step" : undefined}
                className={`border-t-2 pt-3 text-xs leading-5 ${index <= current ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
              >
                <span className="mb-1 block font-semibold">
                  {index < current ? (
                    <Check size={16} aria-label="Completed" />
                  ) : (
                    `0${index + 1}`
                  )}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {error && <ErrorNotice message={error} />}
      {notice && (
        <p role="status" className="mb-4 text-xs leading-5 text-primary">
          {notice}
        </p>
      )}

      {!enabled && step === "password" && (
        <div className="max-w-lg space-y-5">
          <p className="text-xs leading-6 text-muted-foreground">
            Have your authenticator app ready. You’ll scan a QR code, verify a
            six-digit code, and save recovery codes in case you lose access to
            your device.
          </p>
          <form onSubmit={(e) => submit(e, "enable")} className="space-y-4">
            <Field
              label="Confirm your password"
              hint="Enter your current password to begin setup."
            >
              <Input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                disabled={busy}
              />
            </Field>
            <Button disabled={busy}>
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ShieldCheck size={14} />
              )}
              {busy ? "Preparing setup…" : "Set up MFA"}
            </Button>
          </form>
        </div>
      )}

      {step === "connect" && setup && (
        <div className="space-y-6">
          <div>
            <h3
              ref={heading}
              tabIndex={-1}
              className="text-sm font-semibold outline-none"
            >
              Scan the QR code
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Open your authenticator app, choose to add an account, then scan
              this code. MFA will be enabled after you verify a code below.
            </p>
          </div>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="w-fit max-w-full shrink-0 rounded-xl border border-border bg-white p-2">
              <QRCodeSVG
                value={setup.totpURI}
                size={208}
                marginSize={4}
                level="M"
                role="img"
                aria-label="Authenticator setup QR code"
                className="h-auto max-w-full"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="text-xs leading-6">
                <p className="font-medium">Account</p>
                <p className="break-all text-muted-foreground">
                  {me.user.email}
                </p>
              </div>
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  Can’t scan the code?
                </summary>
                <p className="my-3 text-xs leading-6 text-muted-foreground">
                  Enter this setup key manually in your app and choose a
                  time-based account.
                </p>
                <code
                  aria-label="Authenticator setup key"
                  className="block select-all break-all rounded bg-muted p-3 font-mono text-xs leading-6"
                >
                  {setupKey}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void copy(setupKey, "Setup key")}
                >
                  <Copy size={14} />
                  Copy setup key
                </Button>
              </details>
            </div>
          </div>
          <form
            onSubmit={(e) => submit(e, "verify")}
            className="space-y-4 border-t border-border pt-5"
          >
            <div className="max-w-sm">
              <Field
                label="Six-digit authentication code"
                hint="Enter the current code shown in your app. Codes refresh regularly."
              >
                <Input
                  name="code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  required
                  placeholder="000000"
                  disabled={busy}
                  className="font-mono tracking-[0.3em]"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy || code.length !== 6}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? "Verifying…" : "Verify and enable"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSetup(null);
                  setCode("");
                  setError("");
                  setNotice("");
                  setStep("password");
                }}
              >
                Cancel setup
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === "recovery" && (
        <div className="max-w-xl space-y-5">
          <div
            role="status"
            className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-xs leading-6 text-emerald-800"
          >
            MFA is enabled. Save your recovery codes before leaving this page.
          </div>
          <div>
            <h3
              ref={heading}
              tabIndex={-1}
              className="text-sm font-semibold outline-none"
            >
              Save your recovery codes
            </h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              Use a recovery code to sign in if you lose access to your
              authenticator. Each code works once. Store them in your password
              manager or another private place; you won’t be able to see these
              codes again after closing this setup.
            </p>
          </div>
          <div
            aria-label="Recovery codes"
            className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted p-4 font-mono text-sm min-[360px]:grid-cols-2"
          >
            {recoveryCodes.map((value) => (
              <code key={value} className="select-all">
                {value}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void copy(recoveryCodes.join("\n"), "Recovery codes")
              }
            >
              <Copy size={14} />
              Copy codes
            </Button>
            <Button type="button" variant="outline" onClick={downloadCodes}>
              <Download size={14} />
              Download codes
            </Button>
          </div>
          <label className="flex items-start gap-3 text-xs leading-5">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            I have saved my recovery codes somewhere safe.
          </label>
          <Button
            disabled={!saved}
            onClick={() => {
              setRecoveryCodes([]);
              setNotice("");
              setError("");
              setStep("done");
            }}
          >
            Finish setup
          </Button>
        </div>
      )}

      {step === "done" && (
        <div
          role="status"
          className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-emerald-800"
        >
          <h3
            ref={heading}
            tabIndex={-1}
            className="text-sm font-semibold outline-none"
          >
            MFA setup complete
          </h3>
          <p className="mt-2 text-xs leading-6">
            Next time you sign in, you’ll use your password and a code from your
            authenticator.
          </p>
        </div>
      )}

      {enabled &&
        step !== "recovery" &&
        me.user.globalRole !== "SUPERADMIN" && (
          <details className="mt-5">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Disable MFA
            </summary>
            <form
              onSubmit={(e) => submit(e, "disable")}
              className="mt-3 flex max-w-lg flex-wrap items-end gap-3"
            >
              <Field label="Confirm password to disable MFA">
                <Input
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  disabled={busy}
                />
              </Field>
              <Button disabled={busy} variant="outline">
                {busy ? "Disabling…" : "Disable"}
              </Button>
            </form>
          </details>
        )}
    </Panel>
  );
}
