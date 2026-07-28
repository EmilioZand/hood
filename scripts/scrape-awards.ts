import "./env";
import { db } from "../src/db";
import { scrapeJamesBeardAwards } from "../src/lib/sync/scrapeAwards";
import { runScript } from "./runScript";

runScript(async () => {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const result = await scrapeJamesBeardAwards(db, year);
  console.log(
    `James Beard ${year}: ${result.winnersFound} entries found, ${result.candidatesInserted} matched to our restaurants and queued for review.`,
  );
});
