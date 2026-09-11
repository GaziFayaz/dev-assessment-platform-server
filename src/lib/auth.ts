import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import { admin } from "better-auth/plugins/admin";
import { bearer } from "better-auth/plugins/bearer";
import { openAPI } from "better-auth/plugins";
import { role } from "better-auth/plugins/access";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
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
