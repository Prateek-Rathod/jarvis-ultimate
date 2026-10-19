import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server-lifecycle.js";

describe("API startup lifecycle", () => {
  let server: Server | undefined;

  afterEach(async () => {
    const currentServer = server;
    if (!currentServer?.listening) return;
    await new Promise<void>((resolve, reject) => {
      currentServer.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  });

  it("does not open a listener if database initialization fails", async () => {
    const listen = vi.fn();
    const initializeDatabase = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(startApiServer({ port: 3001, initializeDatabase, listen })).rejects.toThrow(
      "database unavailable",
    );
    expect(listen).not.toHaveBeenCalled();
  });

  it("waits for database initialization before accepting requests", async () => {
    let finishInitialization!: () => void;
    const initializeDatabase = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        }),
    );
    const app = express();
    app.get("/health/live", (_request, response) => response.json({ status: "ok" }));
    const listen = vi.fn((port: number) => app.listen(port));
    let resolved = false;

    const startup = startApiServer({ port: 0, initializeDatabase, listen }).then((value) => {
      resolved = true;
      return value;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(listen).not.toHaveBeenCalled();

    finishInitialization();
    server = await startup;
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("surfaces a port collision rather than creating a duplicate listener", async () => {
    const blocker = express().listen(0);
    await new Promise<void>((resolve) => blocker.once("listening", resolve));
    const address = blocker.address() as AddressInfo;

    try {
      await expect(
        startApiServer({
          port: address.port,
          initializeDatabase: async () => {},
          listen: (port) => express().listen(port),
        }),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
