import { PrismaClient } from "@prisma/client";

// Standard Prisma + serverless/hot-reload pattern.
// Prevents ts-node-dev from spawning a fresh PrismaClient (and a fresh
// connection pool) on every file-watch reload, which would otherwise
// exhaust Neon's connection limit during local dev.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}