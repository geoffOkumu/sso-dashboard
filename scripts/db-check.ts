import "./load-env";
import { db } from "../lib/db";
try {
  const tables = await db.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()`;
  console.log(
    `Database reachable; current schema contains ${tables[0].count} tables.`,
  );
} catch {
  console.error(
    "Database connection failed. Check DATABASE_URL and network access.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
