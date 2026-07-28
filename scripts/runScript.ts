import { client } from "../src/db";

/** Runs a script body, then always closes the Postgres connection before exiting —
 * otherwise each one-shot script run leaves a connection open, and a session with
 * many script runs eventually exhausts Postgres's connection slots. */
export async function runScript(fn: () => Promise<void>) {
  try {
    await fn();
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error(err);
    await client.end().catch(() => {});
    process.exit(1);
  }
}
