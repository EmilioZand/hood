import { NextResponse } from "next/server";
import { db } from "@/db";
import { scrapeJamesBeardAwards } from "@/lib/sync/scrapeAwards";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const year = new Date().getFullYear();
  const result = await scrapeJamesBeardAwards(db, year);
  return NextResponse.json({ year, ...result });
}
