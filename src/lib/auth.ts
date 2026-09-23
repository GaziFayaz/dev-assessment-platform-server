import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { bearer } from "better-auth/plugins/bearer";
import { openAPI } from "better-auth/plugins";
import { role } from "better-auth/plugins/access";
import { prisma } from "./prisma.js";
import { env } from "../config/env.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    env.BETTER_AUTH_URL,
    env.CORS_ORIGIN,
    "http://localhost:5000",
    "http://localhost:3000",
  ],
  advanced: {
    // Disable CSRF origin check in development so Postman/API clients can test without sending Origin headers when cookies are stored
    disableCSRFCheck: env.NODE_ENV === "development",
  },
  plugins: [
    organization({
      roles: {
        admin: role({}), // COMPANY_ADMIN
        recruiter: role({}), // RECRUITER
      },
      allowUserToCreateOrganization: async () => true,
    }),
    admin(),
    bearer(),
    openAPI(), // Generates OpenAPI schemas for all /api/auth/* routes
  ],
});

export type Auth = typeof auth;
