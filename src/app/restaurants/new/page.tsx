import { redirect } from "next/navigation";

// The admin-only quick-create form and the self-serve /add-entry flow used to be two
// separate implementations of "create a restaurant + auto-match it on Google" that could
// silently drift apart (they already had different duplicate-detection thresholds before
// being merged). /add-entry is now the one add-a-spot flow for every user, admin or not.
export default function NewRestaurantRedirect() {
  redirect("/add-entry");
}
