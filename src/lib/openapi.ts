import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { auth } from "./auth.js";

// Domain registry for all custom module endpoints
export const registry = new OpenAPIRegistry();

// Register standard security schemes
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT/SessionToken",
  description: "Better Auth session token supplied via Authorization header (bearer plugin)",
});

registry.registerComponent("securitySchemes", "CookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "Better Auth session cookie for browser clients",
});

registry.registerComponent("securitySchemes", "OrganizationContext", {
  type: "apiKey",
  in: "header",
  name: "x-organization-id",
  description: "Active Organization UUID required for tenant-scoped operations",
});

// Build merged OpenAPI 3.1 specification document
export const buildOpenAPISpec = async () => {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const domainSpec = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Developer Assessment & Coding Platform API",
      version: "1.0.0",
      description: "Multi-tenant recruitment and educational assessment backend API specification",
    },
    servers: [
      { url: "/api/v1", description: "V1 Domain API" },
      { url: "/", description: "Root Server" },
    ],
  });

  // Extract Better Auth OpenAPI schema from plugin
  let authSpec: any = {};
  try {
    if (typeof (auth.api as any).generateOpenAPISchema === "function") {
      authSpec = await (auth.api as any).generateOpenAPISchema();
    }
  } catch (error) {
    console.warn("Could not generate Better Auth OpenAPI schema:", error);
  }

  // Deep-merge auth endpoints and domain endpoints
  return {
    ...domainSpec,
    paths: {
      ...(authSpec?.paths || {}),
      ...domainSpec.paths,
    },
    components: {
      ...domainSpec.components,
      schemas: {
        ...(authSpec?.components?.schemas || {}),
        ...(domainSpec.components?.schemas || {}),
      },
    },
  };
};
