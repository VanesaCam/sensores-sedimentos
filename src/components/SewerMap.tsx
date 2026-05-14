import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Locality = {
  id: string;
  responsable: string;
  localidad: string;
  lat: number;
  lng: number;
  v1_agua: number;
  v2_sedimento: number;
  estado: string;
};

function isCritical(loc: Locality): boolean {
  return loc.v1_agua >= 60 || loc.v2_sedimento >= 15;
}

function markerHtml(loc: Locality): string {
  const critical = isCritical(loc);
  const color = critical ? "#ef4444" : loc.v1_agua >= 40 ? "#f59e0b" : "#22c55e";
  return `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #0a0f1c;box-shadow:0 0 0 2px ${color};${
    critical ? "animation: pulse-marker 1s infinite;" : ""
  }"></div>`;
}

export function SewerMap({ localities }: { localities: Locality[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [4.65, -74.1],
      zoom: 11,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19 },
    ).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const loc of localities) {
      const html = markerHtml(loc);
      const icon = L.divIcon({
        html,
        className: "sewer-marker",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const popup = `<div style="font-family:system-ui;color:#0a0f1c;min-width:180px">
        <div style="font-weight:700;margin-bottom:4px">${loc.localidad}</div>
        <div style="font-size:12px;opacity:.7;margin-bottom:6px">Resp: ${loc.responsable}</div>
        <div style="font-size:13px">Agua: <b>${loc.v1_agua.toFixed(1)} cm</b></div>
        <div style="font-size:13px">Sedimento: <b>${loc.v2_sedimento.toFixed(1)} cm</b></div>
        <div style="font-size:12px;margin-top:4px;opacity:.8">Estado: ${loc.estado}</div>
      </div>`;
      const existing = markersRef.current.get(loc.id);
      if (existing) {
        existing.setIcon(icon);
        existing.setPopupContent(popup);
      } else {
        const m = L.marker([loc.lat, loc.lng], { icon })
          .addTo(map)
          .bindPopup(popup);
        markersRef.current.set(loc.id, m);
      }
    }
  }, [localities]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full rounded-lg overflow-hidden border border-border"
      style={{ minHeight: 420, background: "#0a0f1c" }}
    />
  );
}
