import nodemailer from "nodemailer";
import { getEnv } from "./env";
export async function sendMail(to: string, subject: string, text: string) {
  const env = getEnv();
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}
