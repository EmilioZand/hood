import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createRestaurant } from "../actions";

export default async function NewRestaurantPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");

  async function create(formData: FormData) {
    "use server";
    const id = await createRestaurant(formData);
    redirect(`/restaurants/${id}`);
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">Add a spot</h1>
      <p className="mb-4 text-sm text-gray-700">
        Address, coordinates, and ratings are filled in later via Google/Yelp match review.
      </p>
      <form action={create} className="flex flex-col gap-3">
        <input name="name" placeholder="Name" required className="rounded border px-3 py-2" />
        <input name="city" placeholder="City" required className="rounded border px-3 py-2" />
        <input name="neighborhood" placeholder="Neighborhood" className="rounded border px-3 py-2" />
        <input
          name="cuisine"
          placeholder="Cuisine (e.g. Japanese / Izakaya)"
          className="rounded border px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isWalkIn" /> Accepts walk-ins
        </label>
        <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
          Add spot
        </button>
      </form>
    </main>
  );
}
