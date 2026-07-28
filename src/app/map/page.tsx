import { redirect } from "next/navigation";

// The map moved to the home page ("/") with neighborhood-based drill-down filtering.
export default function MapRedirectPage() {
  redirect("/");
}
