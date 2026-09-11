import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const startServer = async () => {
  try {
    const app = await createApp();

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      console.log(`📚 Swagger UI Docs: http://localhost:${env.PORT}/api/docs`);
      console.log(`📄 OpenAPI Spec:    http://localhost:${env.PORT}/api/docs/openapi.json`);
      console.log(`🩺 Healthcheck:     http://localhost:${env.PORT}/api/v1/health`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        console.log("🔒 HTTP server closed.");
        try {
          await prisma.$disconnect();
          console.log("🔌 Database connection closed.");
          process.exit(0);
        } catch (error) {
          console.error("Error during database disconnection:", error);
          process.exit(1);
        }
      });

      // Force shutdown if taking too long
      setTimeout(() => {
        console.error("⚠️ Forced shutdown after 10s timeout.");
        process.exit(1);
      }, 10000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("❌ Fatal error during server startup:", error);
    process.exit(1);
  }
};

startServer();
