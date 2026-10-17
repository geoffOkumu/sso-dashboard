import "./load-env";
import { db } from "../lib/db";
export async function seed() {
  for (const config of [
    {
      slug: "crm",
      name: "Customer CRM",
      description: "A shared home for your customers and contacts.",
      icon: "briefcase",
      port: 3001,
      permissions: ["contacts.read", "contacts.write", "contacts.delete"],
    },
    {
      slug: "analytics",
      name: "Analytics",
      description: "Explore reports and turn your data into decisions.",
      icon: "chart",
      port: 3002,
      permissions: ["reports.read", "reports.export", "dashboards.manage"],
    },
  ]) {
    await db.$transaction(async (tx) => {
      const platform = await tx.platform.upsert({
        where: { slug: config.slug },
        create: {
          slug: config.slug,
          name: config.name,
          description: config.description,
          icon: config.icon,
          launchUrl: `http://localhost:${config.port}/login`,
          displayOrder: config.port - 3000,
        },
        update: {},
      });
      for (const key of config.permissions)
        await tx.platformPermission.upsert({
          where: { platformId_key: { platformId: platform.id, key } },
          create: {
            platformId: platform.id,
            key,
            description: key.replace(".", ": "),
          },
          update: {},
        });
      const permissions = await tx.platformPermission.findMany({
        where: { platformId: platform.id },
      });
      for (const [index, key] of ["viewer", "editor", "admin"].entries()) {
        const exists = await tx.platformRole.findUnique({
          where: { platformId_key: { platformId: platform.id, key } },
        });
        if (exists) continue; // Never overwrite permissions an administrator changed.
        const role = await tx.platformRole.create({
          data: {
            platformId: platform.id,
            key,
            name: key[0].toUpperCase() + key.slice(1),
          },
        });
        for (const permission of permissions.filter(
          (p) => config.permissions.indexOf(p.key) <= index,
        ))
          await tx.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permission.id,
              platformId: platform.id,
            },
          });
      }
    });
  }
}
seed()
  .then(() =>
    console.log(
      "Demo platform definitions ready; no users or credentials created.",
    ),
  )
  .finally(() => db.$disconnect());
