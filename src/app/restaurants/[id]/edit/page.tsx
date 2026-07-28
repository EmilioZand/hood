import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getRestaurantById } from "@/lib/data/restaurants";
import { updateRestaurant } from "../../actions";

export default async function EditRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!user.isAdmin) redirect(`/restaurants/${id}`);

  const restaurant = await getRestaurantById(id);
  if (!restaurant) notFound();

  async function update(formData: FormData) {
    "use server";
    await updateRestaurant(id, formData);
    redirect(`/restaurants/${id}`);
  }

  const cuisineText = restaurant!.cuisines.map((c) => c.cuisine.name).join(" / ");

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">Edit {restaurant!.name}</h1>
      <form action={update} className="flex flex-col gap-3">
        <input
          name="name"
          defaultValue={restaurant!.name}
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="city"
          defaultValue={restaurant!.city}
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="neighborhood"
          defaultValue={restaurant!.neighborhood ?? ""}
          className="rounded border px-3 py-2"
        />
        <input name="cuisine" defaultValue={cuisineText} className="rounded border px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isWalkIn" defaultChecked={restaurant!.isWalkIn ?? false} />{" "}
          Accepts walk-ins
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Michelin status (Michelin&apos;s site blocks scraping — enter manually)
          <select
            name="michelinStatus"
            defaultValue={restaurant!.award?.michelinStatus ?? "none"}
            className="rounded border px-3 py-2"
          >
            <option value="none">None</option>
            <option value="selected">Selected</option>
            <option value="bib_gourmand">Bib Gourmand</option>
            <option value="one_star">One Star</option>
            <option value="two_star">Two Star</option>
            <option value="three_star">Three Star</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-brand-green px-3 py-2 text-brand-cream hover:bg-brand-green-dark">
          Save
        </button>
      </form>
    </main>
  );
}
