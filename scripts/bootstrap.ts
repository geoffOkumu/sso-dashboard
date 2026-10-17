import "./load-env";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "../lib/db";
import { ADMIN_LOCK } from "../lib/admin";
async function main() {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    const email = z
      .email()
      .parse(
        (
          process.env.BOOTSTRAP_EMAIL ||
          (await terminal.question("Superadmin email: "))
        )
          .trim()
          .toLowerCase(),
      );
    const existing = await db.user.findUnique({ where: { email } });
    if (existing?.globalRole === "SUPERADMIN" && existing.status === "ACTIVE") {
      console.log("This superadmin already exists; no changes made.");
      return;
    }
    const name = z
      .string()
      .min(2)
      .parse(
        process.env.BOOTSTRAP_NAME || (await terminal.question("Full name: ")),
      );
    let password = process.env.BOOTSTRAP_PASSWORD;
    if (!password) {
      process.stdout.write("Password (hidden, at least 12 characters): ");
      muted = true;
      password = await terminal.question("");
      muted = false;
      process.stdout.write("\n");
    }
    z.string().min(12).max(128).parse(password);
    const hashed = await hashPassword(password);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`;
      if (
        await tx.user.count({
          where: { globalRole: "SUPERADMIN", status: "ACTIVE" },
        })
      )
        throw new Error(
          "An active superadmin exists. Use the portal to grant further superadmin roles.",
        );
      if (await tx.user.findUnique({ where: { email } }))
        throw new Error("Refusing to overwrite an existing account.");
      const user = await tx.user.create({
        data: {
          email,
          name,
          emailVerified: true,
          status: "ACTIVE",
          globalRole: "SUPERADMIN",
        },
      });
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hashed,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "bootstrap.superadmin_created",
          targetId: user.id,
        },
      });
    });
    console.log(
      "First superadmin created. Sign in and enroll in MFA before administrative operations. Bootstrap trusts the operator's ownership of the email address.",
    );
  } finally {
    terminal.close();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof z.ZodError ? "Invalid bootstrap input" : error.message,
  );
  process.exitCode = 1;
});
