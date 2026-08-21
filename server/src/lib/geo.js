/** Geospatial helpers. Pure functions, no I/O — trivially unit-testable. */

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 * @param {{latitude:number, longitude:number}} a
 * @param {{latitude:number, longitude:number}} b
 */
export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * 1000);
}

export const distanceKm = (a, b) => {
  const m = distanceMeters(a, b);
  return m === null ? null : Math.round(m / 100) / 10;
};

/**
 * Bounding box for a set of points, ready to hand to `map.fitBounds`.
 * @param {Array<{latitude:number, longitude:number}>} points
 */
export function boundsOf(points) {
  const valid = (points ?? []).filter(
    (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)
  );
  if (!valid.length) return null;

  const lats = valid.map((p) => p.latitude);
  const lons = valid.map((p) => p.longitude);
  return {
    south: Math.min(...lats),
    west: Math.min(...lons),
    north: Math.max(...lats),
    east: Math.max(...lons),
  };
}

/**
 * Rough but honest travel estimate between two points for multi-city
 * itineraries. Straight-line distance is inflated by a mode-specific routing
 * factor (roads are not straight) and divided by a realistic door-to-door
 * speed that includes the fixed overhead of that mode — airport time being the
 * obvious example.
 *
 * Clearly an estimate, not a routing engine; the API labels it as such.
 *
 * @param {{latitude:number, longitude:number}} from
 * @param {{latitude:number, longitude:number}} to
 */
export function estimateTravel(from, to) {
  const meters = distanceMeters(from, to);
  if (meters === null) return null;
  const km = meters / 1000;

  const profile = pickProfile(km);
  const routedKm = km * profile.detourFactor;
  const hours = routedKm / profile.speedKph + profile.overheadHours;

  return {
    straightLineKm: Math.round(km * 10) / 10,
    estimatedRouteKm: Math.round(routedKm),
    mode: profile.mode,
    modeLabel: profile.label,
    durationMinutes: Math.round(hours * 60),
    durationLabel: humaniseHours(hours),
    isEstimate: true,
  };
}

function pickProfile(km) {
  if (km <= 2) {
    return { mode: 'walk', label: 'Walk', speedKph: 4.5, detourFactor: 1.25, overheadHours: 0 };
  }
  if (km <= 25) {
    return {
      mode: 'transit',
      label: 'Local transit',
      speedKph: 22,
      detourFactor: 1.3,
      overheadHours: 0.15,
    };
  }
  if (km <= 120) {
    return { mode: 'car', label: 'Drive', speedKph: 62, detourFactor: 1.25, overheadHours: 0.2 };
  }
  if (km <= 700) {
    return {
      mode: 'train',
      label: 'Train or drive',
      speedKph: 95,
      detourFactor: 1.2,
      overheadHours: 0.5,
    };
  }
  return { mode: 'flight', label: 'Flight', speedKph: 750, detourFactor: 1.08, overheadHours: 3.5 };
}

function humaniseHours(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export default { distanceMeters, distanceKm, boundsOf, estimateTravel };
