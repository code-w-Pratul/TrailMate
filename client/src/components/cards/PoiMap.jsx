import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import SectionCard, { EmptyState } from '../ui/SectionCard.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { categoryColor } from '../ui/iconMaps.js';
import { GlobeIcon, MapPinIcon } from '../ui/Icons.jsx';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import { formatDistance } from '../../lib/format.js';

/**
 * Interactive POI map — Leaflet with OpenStreetMap raster tiles.
 *
 * Leaflet rather than Mapbox on purpose: no API key, no token in the bundle, no
 * monthly load ceiling, and one less thing a person cloning this repo has to
 * sign up for. Dark mode is handled with a CSS filter on the tile pane (see
 * index.css) instead of a paid dark tile set.
 *
 * Markers are `divIcon`s built from inline SVG. That sidesteps Leaflet's
 * long-standing bundler problem with its default marker PNGs entirely, and lets
 * a pin's colour come from the same category map the list uses — so list and map
 * can never disagree.
 */
export default function PoiMap({
  location,
  places = [],
  bounds,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  height = 'h-[26rem]',
}) {
  const { distanceUnit } = usePreferences();

  const centre = useMemo(() => {
    if (location?.latitude != null && location?.longitude != null) {
      return [location.latitude, location.longitude];
    }
    return null;
  }, [location]);

  return (
    <SectionCard
      title="Map"
      subtitle={places.length ? `${places.length} pins` : 'Points of interest'}
      icon={GlobeIcon}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeleton={<Skeleton className={`${height} w-full`} />}
      bodyClassName="!p-0"
    >
      {centre ? (
        <div className={`tm-map ${height} p-3`}>
          <MapContainer
            center={centre}
            zoom={13}
            scrollWheelZoom={false}
            className="h-full w-full"
            // Leaflet's own keyboard support is good; make sure it is reachable.
            keyboard
            attributionControl
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
              detectRetina
            />

            <CityMarker location={location} />

            {places.map((place) => (
              <PlaceMarker
                key={place.id}
                place={place}
                selected={selectedId === place.id}
                onSelect={onSelect}
                distanceUnit={distanceUnit}
              />
            ))}

            <FitBounds bounds={bounds} centre={centre} places={places} />
            <FlyToSelected places={places} selectedId={selectedId} />
          </MapContainer>
        </div>
      ) : (
        <div className="p-5">
          <EmptyState
            icon={MapPinIcon}
            title="No coordinates yet"
            description="Pick a destination to plot it on the map."
          />
        </div>
      )}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Markers                                                                    */
/* -------------------------------------------------------------------------- */

/** Teardrop pin as an inline-SVG divIcon, coloured per category. */
function pinIcon(colour, { selected = false } = {}) {
  const scale = selected ? 1.25 : 1;
  const width = 26 * scale;
  const height = 34 * scale;

  return L.divIcon({
    className: 'tm-pin',
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 4],
    html: `
      <svg width="${width}" height="${height}" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13c0 7.5 12 20 12 20z"
              fill="${colour}" stroke="white" stroke-width="2" />
        <circle cx="13" cy="13" r="4.5" fill="white" fill-opacity="0.9" />
      </svg>`,
  });
}

/** The destination centroid, drawn distinctly from the POIs. */
function CityMarker({ location }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'tm-city-pin',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: `
          <span style="display:block;width:18px;height:18px;border-radius:9999px;
                       background:#0f766e;border:3px solid white;
                       box-shadow:0 0 0 2px rgba(15,118,110,.35)"></span>`,
      }),
    []
  );

  if (location?.latitude == null) return null;

  return (
    <Marker position={[location.latitude, location.longitude]} icon={icon} zIndexOffset={500}>
      <Popup>
        <p className="font-semibold">{location.name}</p>
        {location.label && location.label !== location.name ? (
          <p className="text-xs opacity-70">{location.label}</p>
        ) : null}
      </Popup>
    </Marker>
  );
}

function PlaceMarker({ place, selected, onSelect, distanceUnit }) {
  const icon = useMemo(
    () => pinIcon(categoryColor(place.category), { selected }),
    [place.category, selected]
  );

  return (
    <Marker
      position={[place.latitude, place.longitude]}
      icon={icon}
      zIndexOffset={selected ? 400 : 0}
      eventHandlers={{ click: () => onSelect?.(place.id) }}
      // Leaflet exposes the marker to screen readers via its alt text.
      alt={`${place.name} — ${place.categoryLabel ?? place.category}`}
    >
      <Popup>
        <p className="font-semibold">{place.name}</p>
        <p className="mt-0.5 text-xs opacity-70">
          {place.categoryLabel}
          {Number.isFinite(place.distanceM)
            ? ` · ${formatDistance(place.distanceM, distanceUnit)} from centre`
            : ''}
        </p>
        {place.description ? (
          <p className="mt-1.5 max-w-56 text-xs leading-relaxed">{place.description}</p>
        ) : null}
        {place.website ? (
          <a
            href={place.website}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1.5 inline-block text-xs font-medium underline"
          >
            More info
          </a>
        ) : null}
      </Popup>
    </Marker>
  );
}

/* -------------------------------------------------------------------------- */
/* Imperative map behaviours                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Fit the viewport to the pins once per dataset.
 *
 * Guarded by a signature so it does not fight the user: re-fitting on every
 * render would yank the map back every time they panned.
 */
function FitBounds({ bounds, centre, places }) {
  const map = useMap();
  const appliedRef = useRef(null);

  useEffect(() => {
    const signature = `${centre?.join(',')}|${places.length}|${bounds ? Object.values(bounds).join(',') : ''}`;
    if (appliedRef.current === signature) return;
    appliedRef.current = signature;

    if (bounds && places.length) {
      map.fitBounds(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { padding: [28, 28], maxZoom: 15 }
      );
    } else if (centre) {
      map.setView(centre, 13);
    }
  }, [map, bounds, centre, places.length]);

  return null;
}

/** Pan to a place chosen in the list, and open its popup. */
function FlyToSelected({ places, selectedId }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const place = places.find((item) => item.id === selectedId);
    if (!place) return;

    map.flyTo([place.latitude, place.longitude], Math.max(map.getZoom(), 15), {
      duration: 0.6,
    });
  }, [map, places, selectedId]);

  return null;
}
