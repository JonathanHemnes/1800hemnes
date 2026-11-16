/**
 * The drawing half of the Map view, loaded only when someone opens it.
 * The base map is OpenFreeMap's dark style (OpenStreetMap data): free, with
 * no account, key, or usage cap. The page sends no referrer, so the tile
 * host never sees this page's address.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Place } from './family-data';

export interface MapDot {
  place: Place;
  /** People tied to the place, which sets the dot's size. */
  count: number;
}

export interface FamilyMap {
  /** Redraw the dots, e.g. after a line filter; `fit` zooms to show them all. */
  show(dots: MapDot[], fit: boolean): void;
  select(id: string | null): void;
  destroy(): void;
}

const STYLE = 'https://tiles.openfreemap.org/styles/dark';

export function createMap(el: HTMLElement, onPick: (id: string) => void): FamilyMap {
  /* WebGL can't read CSS variables, so take the page's colours as values. */
  const css = getComputedStyle(el);
  const accent = css.getPropertyValue('--accent').trim() || '#8fa8c8';
  const bone = css.getPropertyValue('--bone').trim() || '#ece9e2';
  const ink = css.getPropertyValue('--ink').trim() || '#161719';

  const map = new maplibregl.Map({
    container: el,
    style: STYLE,
    center: [-40, 48],
    zoom: 1.5,
    attributionControl: { compact: true },
    /* Ctrl-scroll or two fingers to move the map, so the page still scrolls past it. */
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'map__tip' });
  let selected: string | null = null;
  let dotsById = new Map<string, MapDot>();
  /* A dot clicked on the map is already in view; only picks from elsewhere fly to it. */
  let pickedHere = false;

  const ready = new Promise<void>((resolve) => {
    map.once('load', () => {
      map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' });
      map.addLayer({
        id: 'places',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-radius': ['+', 5, ['*', 3.2, ['sqrt', ['get', 'count']]]],
          'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], bone, accent],
          'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0.45],
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], bone, accent],
          'circle-stroke-width': 1.5,
        },
        /* Small dots draw on top, so they stay clickable inside big ones. */
        layout: { 'circle-sort-key': ['-', ['get', 'count']] },
      });

      map.on('mousemove', 'places', (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        const dot = id ? dotsById.get(id) : undefined;
        if (!dot) return;
        map.getCanvas().style.cursor = 'pointer';
        tip.setLngLat([dot.place.lng, dot.place.lat]).setText(`${dot.place.name} · ${dot.count}`).addTo(map);
      });
      map.on('mouseleave', 'places', () => {
        map.getCanvas().style.cursor = '';
        tip.remove();
      });
      map.on('click', 'places', (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        pickedHere = true;
        onPick(id);
      });
      resolve();
    });
  });

  map.on('error', (event) => console.warn('Map:', event.error?.message));
  el.style.background = ink;

  const mark = (id: string | null, on: boolean) => {
    if (id && dotsById.has(id)) map.setFeatureState({ source: 'places', id }, { selected: on });
  };

  return {
    show(dots, fit) {
      dotsById = new Map(dots.map((dot) => [dot.place.id, dot]));
      ready.then(() => {
        (map.getSource('places') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: dots.map(({ place, count }) => ({
            type: 'Feature',
            properties: { id: place.id, count },
            geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
          })),
        });
        mark(selected, true);
        if (fit && dots.length) {
          const bounds = new maplibregl.LngLatBounds();
          for (const { place } of dots) bounds.extend([place.lng, place.lat]);
          map.fitBounds(bounds, { padding: 40, maxZoom: 7, duration: 0 });
        }
      });
    },

    select(id) {
      const fly = !pickedHere;
      pickedHere = false;
      ready.then(() => {
        mark(selected, false);
        selected = id;
        mark(selected, true);
        const dot = id ? dotsById.get(id) : undefined;
        if (dot && fly) map.flyTo({ center: [dot.place.lng, dot.place.lat], zoom: Math.max(map.getZoom(), 7), duration: 900 });
      });
    },

    destroy() {
      map.remove();
    },
  };
}
