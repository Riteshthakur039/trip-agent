"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Car,
  Compass,
  Layers,
  MapPin,
  Maximize2,
  Moon,
  Navigation,
  Plane,
  Sparkles,
} from "lucide-react";

type Coordinate = [number, number];

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Expanded geographic coordinate dictionary for instant zero-latency loading
const CITY_COORDINATES: Record<string, Coordinate> = {
  // India
  delhi: [28.6139, 77.209],
  newdelhi: [28.6139, 77.209],
  ncr: [28.6139, 77.209],
  mumbai: [19.076, 72.8777],
  bombay: [19.076, 72.8777],
  bengaluru: [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  goa: [15.2993, 74.124],
  panaji: [15.4909, 73.8278],
  jaipur: [26.9124, 75.7873],
  agra: [27.1767, 78.0081],
  udaipur: [24.5854, 73.7125],
  jodhpur: [26.2389, 73.0243],
  srinagar: [34.0837, 74.7973],
  gulmarg: [34.0484, 74.3805],
  manali: [32.2432, 77.1892],
  chandigarh: [30.7333, 76.7794],
  shimla: [31.1048, 77.1734],
  rishikesh: [30.0869, 78.2676],
  uttarakhand: [30.0869, 78.2676], // Rishikesh gateway corridor into Uttarakhand
  dehradun: [30.3165, 78.0322],
  haridwar: [29.9457, 78.1642],
  mussoorie: [30.4598, 78.0644],
  nainital: [29.3919, 79.4542],
  corbett: [29.53, 78.7747],
  jimcorbett: [29.53, 78.7747],
  auli: [30.5298, 79.5694],
  kedarnath: [30.7346, 79.0669],
  badrinath: [30.7433, 79.4938],
  almora: [29.5971, 79.6591],
  ranikhet: [29.6434, 79.4322],
  kanatal: [30.4158, 78.3475],
  tehri: [30.3833, 78.4833],
  chopta: [30.4853, 79.1764],
  dharamshala: [32.219, 76.3234],
  dalhousie: [32.5387, 75.971],
  kasauli: [30.9013, 76.9649],
  kalka: [30.8357, 76.9333],
  amritsar: [31.634, 74.8723],
  varanasi: [25.3176, 82.9739],
  kochi: [9.9312, 76.2673],
  kerala: [9.9312, 76.2673],
  munnar: [10.0889, 77.0595],
  kolkata: [22.5726, 88.3639],
  chennai: [13.0827, 80.2707],
  hyderabad: [17.385, 78.4867],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  leh: [34.1526, 77.5771],
  ladakh: [34.1526, 77.5771],

  // International
  tokyo: [35.6762, 139.6503],
  kyoto: [35.0116, 135.7681],
  osaka: [34.6937, 135.5023],
  japan: [35.6762, 139.6503],
  paris: [48.8566, 2.3522],
  london: [51.5074, -0.1278],
  newyork: [40.7128, -74.006],
  nyc: [40.7128, -74.006],
  dubai: [25.2048, 55.2708],
  abu_dhabi: [24.4539, 54.3773],
  singapore: [1.3521, 103.8198],
  bali: [-8.4095, 115.1889],
  bangkok: [13.7563, 100.5018],
  phuket: [7.8804, 98.3923],
  thailand: [13.7563, 100.5018],
  rome: [41.9028, 12.4964],
  florence: [43.7696, 11.2558],
  venice: [45.4408, 12.3155],
  milan: [45.4642, 9.19],
  italy: [41.9028, 12.4964],
  zurich: [47.3769, 8.5417],
  geneva: [46.2044, 6.1432],
  interlaken: [46.6863, 7.8632],
  switzerland: [47.3769, 8.5417],
  barcelona: [41.3879, 2.1699],
  madrid: [40.4168, -3.7038],
  amsterdam: [52.3676, 4.9041],
  vienna: [48.2082, 16.3738],
  prague: [50.0755, 14.4378],
  berlin: [52.52, 13.405],
  munich: [48.1351, 11.582],
  sydney: [-33.8688, 151.2093],
  melbourne: [-37.8136, 144.9631],
  maldives: [4.1755, 73.5093],
  male: [4.1755, 73.5093],
};

function normalizeName(str: string): string {
  return str.toLowerCase().replace(/[^a-z]/g, "");
}

function resolveKnownCoords(location: string | undefined): Coordinate | undefined {
  if (!location) return undefined;

  const normalized = normalizeName(location);
  const exact = CITY_COORDINATES[normalized];
  if (exact) return exact;

  // Agent constraints can contain labels such as "Chandigarh, India", "Uttarakhand", or
  // "Shimla (Himachal Pradesh)". Match the known city inside that label before
  // falling back to a default route.
  const match = Object.entries(CITY_COORDINATES).find(([city]) =>
    normalized.includes(city)
  );
  if (match) return match[1];

  if (normalized.includes("uttar") || normalized.includes("khand") || normalized.includes("ukhand")) {
    return CITY_COORDINATES["uttarakhand"];
  }
  if (normalized.includes("himachal") || normalized.includes("hp")) {
    return CITY_COORDINATES["shimla"];
  }

  return undefined;
}

function findCoords(text: string): { name: string; coords: Coordinate }[] {
  const found: { name: string; coords: Coordinate }[] = [];
  const lower = text.toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (lower.includes(key)) {
      const capName = key.charAt(0).toUpperCase() + key.slice(1);
      if (!found.some((item) => item.name.toLowerCase() === key)) {
        found.push({ name: capName, coords });
      }
    }
  }
  return found;
}

// Great Circle Geodesic Arc Generator for international flight corridors
function createGreatCircleArc(
  start: Coordinate,
  end: Coordinate,
  numPoints = 48
): Coordinate[] {
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;
  const points: Coordinate[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = lat1 + (lat2 - lat1) * t;
    const lon = lon1 + (lon2 - lon1) * t;
    // Parabolic curvature to visually simulate planetary spherical projection
    const midOffset =
      Math.sin(t * Math.PI) * Math.min(18, Math.abs(lon2 - lon1) * 0.16);
    const curveSign = lat1 >= 0 ? 1 : -1;
    points.push([lat + midOffset * curveSign, lon]);
  }
  return points;
}

// Haversine direct distance in kilometers
function calculateHaversineDistance(start: Coordinate, end: Coordinate): number {
  const R = 6371;
  const dLat = ((end[0] - start[0]) * Math.PI) / 180;
  const dLon = ((end[1] - start[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((start[0] * Math.PI) / 180) *
      Math.cos((end[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Mapbox Style Definitions
export type MapboxStyleId =
  | "streets-v12"
  | "navigation-night-v1"
  | "satellite-streets-v12"
  | "outdoors-v12";

const MAP_STYLES: {
  id: MapboxStyleId;
  name: string;
  badge: string;
  icon: typeof Car;
}[] = [
  {
    id: "streets-v12",
    name: "Mapbox Road Map",
    badge: "HD Streets",
    icon: Car,
  },
  {
    id: "navigation-night-v1",
    name: "Night Navigation",
    badge: "Night Roads",
    icon: Moon,
  },
  {
    id: "satellite-streets-v12",
    name: "Satellite & Roads",
    badge: "Satellite",
    icon: Layers,
  },
  {
    id: "outdoors-v12",
    name: "Scenic Byways",
    badge: "Terrain",
    icon: Compass,
  },
];

export function JourneyMap({
  origin,
  destination,
  itineraryText,
  isDark = true,
}: {
  origin?: string;
  destination?: string;
  itineraryText?: string;
  isDark?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const activeTileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const [currentStyle, setCurrentStyle] = useState<MapboxStyleId>(
    isDark ? "navigation-night-v1" : "streets-v12"
  );
  const [routeInfo, setRouteInfo] = useState<{
    type: "driving" | "flight";
    distanceKm: number;
    durationHours?: number;
    summary?: string;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;

    // Detect locations from props or itinerary text
    const textBlob = `${origin ?? ""} ${destination ?? ""} ${itineraryText ?? ""}`;
    const detected = findCoords(textBlob);

    const knownOrigin = resolveKnownCoords(origin);
    const knownDestination = resolveKnownCoords(destination);

    const originCoord = knownOrigin ?? CITY_COORDINATES["delhi"];
    const destCoord =
      knownDestination ??
      (destination && (destination.toLowerCase().includes("uttar") || destination.toLowerCase().includes("khand"))
        ? CITY_COORDINATES["uttarakhand"]
        : knownOrigin
        ? CITY_COORDINATES["uttarakhand"]
        : CITY_COORDINATES["tokyo"]);

    const points: {
      name: string;
      coords: Coordinate;
      role: "origin" | "destination" | "waypoint";
    }[] = [
      {
        name: origin || "New Delhi (DEL)",
        coords: originCoord,
        role: "origin",
      },
      {
        name: destination || (origin ? "Uttarakhand (Rishikesh Gateway)" : "Tokyo (HND)"),
        coords: destCoord,
        role: "destination",
      },
    ];

    detected.forEach((item) => {
      if (!points.some((p) => p.name.toLowerCase() === item.name.toLowerCase())) {
        points.push({ name: item.name, coords: item.coords, role: "waypoint" });
      }
    });

    // Initialize Map instance if needed
    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
      });
      mapRef.current = map;

      // Add Zoom Control at bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map);
    }

    const map = mapRef.current;

    // Switch or update Tile Layer to high-definition 512@2x Mapbox Road Tiles
    if (activeTileLayerRef.current) {
      map.removeLayer(activeTileLayerRef.current);
    }

    const tileUrl = `https://api.mapbox.com/styles/v1/mapbox/${currentStyle}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
    const tileLayer = L.tileLayer(tileUrl, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 19,
      attribution:
        '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    activeTileLayerRef.current = tileLayer;

    // Clear previous routes & markers
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
    }
    const layerGroup = L.layerGroup().addTo(map);
    routeLayerRef.current = layerGroup;

    // Add Custom Pulsing Mapbox Markers
    points.forEach((pt) => {
      const isOrigin = pt.role === "origin";
      const isDest = pt.role === "destination";
      const color = isDest ? "#10b981" : isOrigin ? "#6366f1" : "#f59e0b";
      const glowRgba = isDest
        ? "rgba(16, 185, 129, 0.45)"
        : isOrigin
        ? "rgba(99, 102, 241, 0.45)"
        : "rgba(245, 158, 11, 0.45)";

      const customIcon = L.divIcon({
        className: "custom-mapbox-marker",
        html: `
          <div style="position: relative; width: 34px; height: 34px; display: grid; place-items: center;">
            <div style="position: absolute; inset: -4px; border-radius: 50%; background: ${color}; opacity: 0.35; animation: pulse 2.2s infinite; filter: blur(2px);"></div>
            <div style="width: 26px; height: 26px; border-radius: 50%; background: ${color}; border: 2.5px solid #ffffff; box-shadow: 0 4px 16px ${glowRgba}; display: grid; place-items: center; color: #ffffff; font-size: 11px; font-weight: 800;">
              ${isOrigin ? "🛫" : isDest ? "★" : "•"}
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker(pt.coords, { icon: customIcon }).addTo(layerGroup);
      marker.bindPopup(`
        <div style="font-family: inherit; padding: 6px 4px; color: #0f172a; min-width: 140px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
            <strong style="font-size: 13px; color: #0f172a;">${pt.name}</strong>
          </div>
          <small style="color: #64748b; font-size: 11px; display: block;">
            ${isOrigin ? "Departure Location" : isDest ? "Primary Destination" : "Itinerary Stop"}
          </small>
          <div style="margin-top: 4px; font-size: 10px; color: #94a3b8; font-family: monospace;">
            ${pt.coords[0].toFixed(3)}°N, ${pt.coords[1].toFixed(3)}°E
          </div>
        </div>
      `);
    });

    // Fetch Mapbox Directions API for REAL driving road geometry
    async function resolveRoute() {
      const startPt = points[0].coords;
      const endPt = points[1].coords;

      // Mapbox Directions takes [lon, lat]
      const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startPt[1]},${startPt[0]};${endPt[1]},${endPt[0]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

      try {
        const res = await fetch(dirUrl);
        const data = await res.json();

        if (
          isMounted &&
          data.code === "Ok" &&
          data.routes &&
          data.routes.length > 0
        ) {
          const route = data.routes[0];
          // Convert Mapbox [lon, lat] coordinates to Leaflet [lat, lon]
          const roadCoordinates: Coordinate[] = route.geometry.coordinates.map(
            ([lon, lat]: [number, number]) => [lat, lon]
          );

          const distanceKm = Math.round(route.distance / 1000);
          const durationHours = Math.round((route.duration / 3600) * 10) / 10;

          // 1. Dual-layer glowing Road Polyline
          // Outer Glow
          L.polyline(roadCoordinates, {
            color: "#10b981",
            weight: 8,
            opacity: 0.35,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(layerGroup);

          // Core Road Line
          const roadPolyline = L.polyline(roadCoordinates, {
            color: "#10b981",
            weight: 4,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(layerGroup);

          map.fitBounds(roadPolyline.getBounds(), { padding: [55, 55] });

          setRouteInfo({
            type: "driving",
            distanceKm,
            durationHours,
            summary: route.legs?.[0]?.summary || "Expressway / Highway Roadway",
          });
          return;
        }
      } catch {
        // Fallback to flight corridor
      }

      // If driving road is unavailable (e.g. transoceanic or across borders), draw Great Circle flight corridor
      if (!isMounted) return;

      const flightCoords = createGreatCircleArc(startPt, endPt);
      const directDistance = calculateHaversineDistance(startPt, endPt);

      // Outer Flight Aura
      L.polyline(flightCoords, {
        color: "#6366f1",
        weight: 6,
        opacity: 0.28,
        lineCap: "round",
      }).addTo(layerGroup);

      // Core Flight Arc
      const flightPolyline = L.polyline(flightCoords, {
        color: "#38bdf8",
        weight: 3,
        opacity: 0.9,
        dashArray: "6, 8",
        lineCap: "round",
      }).addTo(layerGroup);

      map.fitBounds(flightPolyline.getBounds(), { padding: [55, 55] });

      setRouteInfo({
        type: "flight",
        distanceKm: directDistance,
        summary: "Direct Flight Corridor",
      });
    }

    resolveRoute();

    return () => {
      isMounted = false;
    };
  }, [origin, destination, itineraryText, currentStyle]);

  function resetView() {
    mapRef.current?.setZoom(3);
  }

  return (
    <div className="journey-map-wrapper">
      <div className="journey-map-header">
        <div className="map-badge">
          <Car size={15} className="text-emerald" />
          <span>Mapbox HD Road Network</span>
        </div>

        {routeInfo && (
          <div className="map-badge map-hud-metric">
            {routeInfo.type === "driving" ? (
              <>
                <Car size={13} className="text-emerald" />
                <span>
                  <strong>{routeInfo.distanceKm} km</strong> driving · ~{routeInfo.durationHours} hrs
                </span>
              </>
            ) : (
              <>
                <Plane size={13} className="text-sky" />
                <span>
                  <strong>{routeInfo.distanceKm.toLocaleString()} km</strong> flight corridor
                </span>
              </>
            )}
          </div>
        )}

        <div className="map-actions">
          {MAP_STYLES.map((style) => {
            const Icon = style.icon;
            const isActive = currentStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                className={`map-action-pill ${isActive ? "active" : ""}`}
                onClick={() => setCurrentStyle(style.id)}
                title={style.name}
              >
                <Icon size={13} />
                <span>{style.badge}</span>
              </button>
            );
          })}

          <button
            type="button"
            className="map-action-pill"
            onClick={resetView}
            title="Recenter World View"
          >
            <Compass size={13} />
            <span>Recenter</span>
          </button>
        </div>
      </div>

      <div ref={containerRef} className="journey-map-canvas" />

      <div className="map-attribution-mapbox">
        <span>© Mapbox · © OpenStreetMap</span>
      </div>
    </div>
  );
}
