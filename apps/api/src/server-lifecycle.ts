import type { Server } from "node:http";

interface StartApiServerOptions {
  port: number;
  initializeDatabase: () => Promise<void>;
  listen: (port: number) => Server;
}

export async function startApiServer({
  port,
  initializeDatabase,
  listen,
}: StartApiServerOptions): Promise<Server> {
  await initializeDatabase();

  const server = listen(port);
  return new Promise<Server>((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
  });
}
