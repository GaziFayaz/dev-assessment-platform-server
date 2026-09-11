import { buildOpenAPISpec } from "../lib/openapi.js";

async function main() {
  console.log("🔍 Validating OpenAPI specification...");
  try {
    const spec = await buildOpenAPISpec();
    const pathsCount = Object.keys(spec.paths || {}).length;
    const schemasCount = Object.keys(spec.components?.schemas || {}).length;

    console.log(`✅ OpenAPI 3.1 specification successfully generated.`);
    console.log(`📊 Stats: ${pathsCount} routes documented, ${schemasCount} schemas registered.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ OpenAPI validation failed:", error);
    process.exit(1);
  }
}

main();
