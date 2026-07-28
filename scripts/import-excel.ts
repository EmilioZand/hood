import "./env";
import * as XLSX from "xlsx";
import { eq, and } from "drizzle-orm";
import { db } from "../src/db";
import { restaurants, restaurantNotes } from "../src/db/schema";
import { addCuisineTags } from "../src/lib/data/cuisines";
import { runScript } from "./runScript";

const SHEET_NAME = "By Neighborhood";

// Column indices in the "By Neighborhood" sheet (0-based), matching the header row:
// Neighborhood/Area, City, Restaurant, Cuisine/Type, Been There, Priority, Mention Count, Michelin/James Beard, Notes
const COL = {
  neighborhood: 0,
  city: 1,
  name: 2,
  cuisine: 3,
  beenThere: 4,
  priority: 5,
  mentionCount: 6,
  awardNote: 7,
  notes: 8,
} as const;

type SourceRow = {
  neighborhood: string | null;
  city: string;
  name: string;
  cuisineRaw: string | null;
  beenThere: boolean;
  isHighPriority: boolean;
  mentionCount: number | null;
  awardNote: string | null;
  notes: string | null;
};

function cleanCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function parseRows(filePath: string): SourceRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${filePath}`);
  }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const [, ...dataRows] = raw; // drop header row

  const rows: SourceRow[] = [];
  for (const row of dataRows) {
    const name = cleanCell(row[COL.name]);
    const city = cleanCell(row[COL.city]);
    if (!name || !city) continue; // skip rows missing the two fields we key on

    rows.push({
      neighborhood: cleanCell(row[COL.neighborhood]),
      city,
      name,
      cuisineRaw: cleanCell(row[COL.cuisine]),
      beenThere: cleanCell(row[COL.beenThere])?.toLowerCase() === "yes",
      isHighPriority: cleanCell(row[COL.priority])?.toLowerCase() === "high",
      mentionCount: row[COL.mentionCount] != null ? Number(row[COL.mentionCount]) : null,
      awardNote: cleanCell(row[COL.awardNote]),
      notes: cleanCell(row[COL.notes]),
    });
  }
  return rows;
}

async function importRow(row: SourceRow) {
  const [existing] = await db
    .select()
    .from(restaurants)
    .where(and(eq(restaurants.name, row.name), eq(restaurants.city, row.city)))
    .limit(1);

  const values = {
    name: row.name,
    city: row.city,
    neighborhood: row.neighborhood,
    priority: row.isHighPriority ? ("high" as const) : ("none" as const),
    isHighPriority: row.isHighPriority,
    mentionCount: row.mentionCount,
    legacyAwardNote: row.awardNote,
    legacyBeenThere: row.beenThere,
  };

  const restaurantId = existing
    ? existing.id
    : (
        await db
          .insert(restaurants)
          .values(values)
          .returning({ id: restaurants.id })
      )[0].id;

  if (existing) {
    await db.update(restaurants).set(values).where(eq(restaurants.id, restaurantId));
  }

  await addCuisineTags(db, restaurantId, row.cuisineRaw);

  if (row.notes) {
    const [existingNote] = await db
      .select()
      .from(restaurantNotes)
      .where(
        and(
          eq(restaurantNotes.restaurantId, restaurantId),
          eq(restaurantNotes.body, row.notes),
        ),
      )
      .limit(1);

    if (!existingNote) {
      await db.insert(restaurantNotes).values({
        restaurantId,
        authorId: null,
        body: `[Imported from spreadsheet] ${row.notes}`,
      });
    }
  }

  return { restaurantId, isNew: !existing };
}

runScript(async () => {
  const filePath = process.argv[2] ?? process.env.EXCEL_IMPORT_PATH;
  if (!filePath) {
    throw new Error("Usage: tsx scripts/import-excel.ts <path-to-xlsm>  (or set EXCEL_IMPORT_PATH)");
  }

  console.log(`Reading ${filePath}...`);
  const rows = parseRows(filePath);
  console.log(`Parsed ${rows.length} rows from "${SHEET_NAME}".`);

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const { isNew } = await importRow(row);
    if (isNew) created++;
    else updated++;
  }

  console.log(`Done. Created ${created}, updated ${updated} (idempotent — safe to re-run).`);
});
