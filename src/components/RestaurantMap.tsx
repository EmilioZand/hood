"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapPin = {
  id: string;
  restaurantId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  cuisines: string[];
  googleRating: string | null;
  isHighPriority: boolean;
};

const BAY_AREA_CENTER: [number, number] = [-122.35, 37.72];

export function RestaurantMap({
  pins,
  className = "h-[70vh] w-full rounded border",
  wrapperClassName,
  fitBounds = false,
}: {
  pins: MapPin[];
  className?: string;
  // Positioning (e.g. "sticky top-6") must NOT go on `className` — Mapbox GL's own
  // stylesheet sets `.mapboxgl-map { position: relative }` on this exact element (it
  // adds that class itself once initialized), which silently wins the cascade over a
  // `sticky` utility of equal specificity and turns it into a plain, non-sticky offset.
  // Put positioning on this separate wrapper div instead.
  wrapperClassName?: string;
  // Restaurant detail page: fit tightly around this restaurant's own location(s)
  // (one or several, for a chain) instead of the whole-region default view.
  fitBounds?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

    if (fitBounds && pins.length > 1) {
      const bounds = pins.reduce(
        (b, pin) => b.extend([pin.longitude, pin.latitude]),
        new mapboxgl.LngLatBounds([pins[0].longitude, pins[0].latitude], [pins[0].longitude, pins[0].latitude]),
      );
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        bounds,
        fitBoundsOptions: { padding: 60, maxZoom: 15 },
      });
    } else {
      const [center, zoom]: [[number, number], number] =
        pins.length === 1 ? [[pins[0].longitude, pins[0].latitude], 15] : [BAY_AREA_CENTER, 9];
      mapRef.current = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center,
        zoom,
      });
    }
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial center/zoom only, deliberately not reactive to later pin changes
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const pin of pins) {
      const popupHtml = `
        <a href="/restaurants/${pin.restaurantId}" style="font-weight:600;color:#1e3d32;text-decoration:underline">${escapeHtml(pin.name)}</a>
        <div style="font-size:12px;color:#555;margin-top:2px">
          ${pin.address ? `${escapeHtml(pin.address)}<br/>` : ""}
          ${pin.cuisines.map(escapeHtml).join(", ")}
          ${pin.googleRating ? `<br/>Google: ${escapeHtml(pin.googleRating)}★` : ""}
        </div>
      `;

      const marker = new mapboxgl.Marker({ color: pin.isHighPriority ? "#d4a83a" : "#1e3d32" })
        .setLngLat([pin.longitude, pin.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 24 }).setHTML(popupHtml))
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [pins]);

  const map = <div ref={containerRef} className={className} />;
  return wrapperClassName ? <div className={wrapperClassName}>{map}</div> : map;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
