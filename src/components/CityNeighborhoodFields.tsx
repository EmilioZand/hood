"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@/components/Combobox";

export type NeighborhoodOption = { name: string; city: string };

/** City + Neighborhood inputs as a pair: City stays plain free text (no canonical city
 * list exists), but Neighborhood suggestions narrow to whatever's typed into City so
 * far. Both render as a custom type-ahead dropdown (see Combobox) rather than a native
 * <datalist> — native datalist popups render their own unstyleable dropdown-arrow
 * indicator that doesn't align with the rest of the field. */
export function CityNeighborhoodFields({
  neighborhoods,
  initialCity = "",
  initialNeighborhood = "",
  cityRequired = false,
  className = "rounded border px-3 py-2",
}: {
  neighborhoods: NeighborhoodOption[];
  initialCity?: string;
  initialNeighborhood?: string;
  cityRequired?: boolean;
  className?: string;
}) {
  const [city, setCity] = useState(initialCity);

  const cityOptions = useMemo(
    () => [...new Set(neighborhoods.map((n) => n.city))].sort(),
    [neighborhoods],
  );

  const neighborhoodOptions = useMemo(() => {
    const trimmed = city.trim().toLowerCase();
    if (!trimmed) return [];
    return [
      ...new Set(
        neighborhoods.filter((n) => n.city.trim().toLowerCase() === trimmed).map((n) => n.name),
      ),
    ].sort();
  }, [city, neighborhoods]);

  return (
    <>
      <Combobox
        name="city"
        placeholder="City"
        required={cityRequired}
        options={cityOptions}
        value={city}
        onValueChange={setCity}
        className={className}
      />
      <Combobox
        name="neighborhood"
        placeholder="Neighborhood"
        options={neighborhoodOptions}
        defaultValue={initialNeighborhood}
        className={className}
      />
    </>
  );
}
