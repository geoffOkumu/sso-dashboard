CREATE TYPE "PlatformType" AS ENUM ('SSO', 'LINK');

ALTER TABLE "Platform" ADD COLUMN "type" "PlatformType" NOT NULL DEFAULT 'SSO';
