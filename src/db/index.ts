import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// In dev, Next.js's Fast Refresh re-evaluates this module on every hot reload,
// which would otherwise create a brand-new connection pool each time and never
// close the old one — a session with enough edits exhausts Postgres's connection
// slots (hit this for real: it eventually broke Supabase Auth's own DB access).
// Caching the client on globalThis makes it survive HMR like a true singleton.
declare global {
  // eslint-disable-next-line no-var -- required for the globalThis caching pattern
  var __dbClient: postgres.Sql | undefined;
}

export const client =
  globalThis.__dbClient ?? postgres(connectionString, { prepare: false, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = client;
}

export const db = drizzle(client, { schema });
