-- Enable session-bound renewal for existing confidential SSO registrations.
-- Existing tokens are unchanged; apps must request offline_access on a new login.
UPDATE "oauthClient" AS c
SET "scopes" = CASE WHEN 'offline_access' = ANY(c."scopes") THEN c."scopes"
                    ELSE array_append(c."scopes", 'offline_access') END,
    "grantTypes" = CASE WHEN 'refresh_token' = ANY(c."grantTypes") THEN c."grantTypes"
                        ELSE array_append(c."grantTypes", 'refresh_token') END
FROM "PlatformClient" AS p
WHERE p."oauthClientId" = c."clientId"
  AND c."tokenEndpointAuthMethod" = 'client_secret_basic'
  AND 'authorization_code' = ANY(c."grantTypes");
