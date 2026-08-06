import "./env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { cuisineGroups, cuisines } from "../src/db/schema";
import { CUISINE_GROUPS, classifyCuisineGroup } from "../src/lib/data/cuisineGroups";
import { runScript } from "./runScript";

runScript(async () => {
  const groupIdByName = new Map<string, string>();
  for (const [name] of CUISINE_GROUPS) {
    const [existing] = await db.select().from(cuisineGroups).where(eq(cuisineGroups.name, name)).limit(1);
    if (existing) {
      groupIdByName.set(name, existing.id);
      continue;
    }
    const [created] = await db.insert(cuisineGroups).values({ name }).returning();
    groupIdByName.set(name, created.id);
    console.log(`Created group: ${name}`);
  }

  const allCuisines = await db.select().from(cuisines);
  let updated = 0;
  let ungrouped = 0;
  for (const cuisine of allCuisines) {
    const groupName = classifyCuisineGroup(cuisine.name);
    const groupId = groupName ? (groupIdByName.get(groupName) ?? null) : null;
    if (!groupId) ungrouped++;
    if (groupId === cuisine.groupId) continue;
    await db.update(cuisines).set({ groupId }).where(eq(cuisines.id, cuisine.id));
    updated++;
  }

  console.log(`Updated ${updated}/${allCuisines.length} cuisine tags (${ungrouped} left ungrouped).`);
});
