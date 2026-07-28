import { NextResponse } from "next/server";
import { db } from "@/db";
import { runSyncBatch } from "@/lib/sync/runSyncBatch";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await runSyncBatch(db, {
    google: process.env.GOOGLE_PLACES_API_KEY,
    yelp: process.env.YELP_FUSION_API_KEY,
  });

  return NextResponse.json(result);
}
