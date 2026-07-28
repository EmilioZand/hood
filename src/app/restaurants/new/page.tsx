import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getAllNeighborhoods } from "@/lib/data/neighborhoods";
import { getAllCuisines } from "@/lib/data/restaurants";
import { db } from "@/db";
import { CityNeighborhoodFields } from "@/components/CityNeighborhoodFields";
import { CuisineCombobox } from "@/components/CuisineCombobox";
import { createRestaurant } from "../actions";

export default async function NewRestaurantPage({
  searchParams,
}: {
  searchParams: Promise<{
    dupId?: string;
    dupName?: string;
    dupCity?: string;
    name?: string;
    city?: string;
    neighborhood?: string;
    cuisine?: string;
    isWalkIn?: string;
  }>;
}) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  const params = await searchParams;
  const [neighborhoods, allCuisines] = await Promise.all([getAllNeighborhoods(db), getAllCuisines()]);
  const cuisineNames = allCuisines.map((c) => c.name);

  async function create(formData: FormData) {
    "use server";
    const result = await createRestaurant(formData);

    if ("duplicate" in result) {
      const qp = new URLSearchParams({
        dupId: result.duplicate.id,
        dupName: result.duplicate.name,
        dupCity: result.duplicate.city,
        name: String(formData.get("name") ?? ""),
        city: String(formData.get("city") ?? ""),
        neighborhood: String(formData.get("neighborhood") ?? ""),
        cuisine: String(formData.get("cuisine") ?? ""),
      });
      if (formData.get("isWalkIn") === "on") qp.set("isWalkIn", "1");
      redirect(`/restaurants/new?${qp.toString()}`);
    }

    redirect(`/restaurants/${result.id}`);
  }

  const duplicate = params.dupId
    ? { id: params.dupId, name: params.dupName ?? "", city: params.dupCity ?? "" }
    : null;

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">Add a spot</h1>
      <p className="mb-4 text-sm text-gray-700">
        Address, coordinates, and ratings are looked up automatically via Google Places once
        you submit — confirm any uncertain match later at{" "}
        <Link href="/admin/matches" className="underline">
          match review
        </Link>
        .
      </p>

      {duplicate && (
        <div className="mb-4 rounded border border-brand-gold bg-brand-gold/10 px-3 py-2 text-sm">
          A similar spot already exists:{" "}
          <Link href={`/restaurants/${duplicate.id}`} className="font-medium underline">
            {duplicate.name} · {duplicate.city}
          </Link>
          . Submit again to create this as a separate spot anyway.
        </div>
      )}

      <form action={create} className="flex flex-col gap-3">
        {duplicate && <input type="hidden" name="confirmCreate" value="1" />}
        <input
          name="name"
          placeholder="Name"
          required
          defaultValue={params.name ?? ""}
          className="rounded border px-3 py-2"
        />
        <CityNeighborhoodFields
          key={`${params.city ?? ""}|${params.neighborhood ?? ""}`}
          neighborhoods={neighborhoods}
          initialCity={params.city ?? ""}
          initialNeighborhood={params.neighborhood ?? ""}
          cityRequired
        />
        <CuisineCombobox
          name="cuisine"
          cuisines={cuisineNames}
          defaultValue={params.cuisine ?? ""}
          placeholder="Cuisine (e.g. Japanese / Izakaya)"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isWalkIn" defaultChecked={params.isWalkIn === "1"} /> Accepts
          walk-ins
        </label>
        <button
          type="submit"
          className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark"
        >
          {duplicate ? "Create anyway" : "Add spot"}
        </button>
      </form>
    </main>
  );
}
