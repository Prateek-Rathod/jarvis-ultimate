import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./database/client.js";
import { startApiServer } from "./server-lifecycle.js";

async function start() {
  let server;
  try {
    server = await startApiServer({
      port: env.API_PORT,
      initializeDatabase: async () => {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
      },
      listen: (port) => app.listen(port),
    });
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        message: "JARVIS API startup failed",
        name: error instanceof Error ? error.name : "UnknownError",
        code: errorCode,
      }),
    );
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Prisma cleanup after startup failure failed",
          name: disconnectError instanceof Error ? disconnectError.name : "UnknownError",
        }),
      );
    }
    process.exitCode = 1;
    return;
  }

  console.info(
    JSON.stringify({ level: "info", message: "JARVIS API listening", port: env.API_PORT }),
  );

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: string) => {
    if (shutdownPromise) return;
    shutdownPromise = (async () => {
      console.info(JSON.stringify({ level: "info", message: "JARVIS API shutting down", signal }));
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "JARVIS API listener shutdown failed",
            name: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        process.exitCode = 1;
      }

      try {
        await prisma.$disconnect();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Prisma shutdown failed",
            name: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        process.exitCode = 1;
      }
      console.info(JSON.stringify({ level: "info", message: "JARVIS API stopped" }));
    })();
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown(signal));
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  void start();
}
