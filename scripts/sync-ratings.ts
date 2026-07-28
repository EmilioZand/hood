import "./env";
import { db } from "../src/db";
import { runSyncBatch } from "../src/lib/sync/runSyncBatch";
import { runScript } from "./runScript";

runScript(async () => {
  const result = await runSyncBatch(db, {
    google: process.env.GOOGLE_PLACES_API_KEY,
    yelp: process.env.YELP_FUSION_API_KEY,
  });
  console.log(`Synced ${result.succeeded}/${result.total} locations (${result.failed} failed).`);
});
