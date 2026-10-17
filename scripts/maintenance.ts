import "./load-env";
import { db } from "../lib/db";
try {
  const before = new Date(Date.now() - 86400000);
  const [limits, verifications] = await Promise.all([
    db.requestLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: before } } }),
  ]);
  console.log(
    `Removed ${limits.count} expired rate buckets and ${verifications.count} expired verification records.`,
  );
} finally {
  await db.$disconnect();
}
