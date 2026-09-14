import { APP } from '/js/config.js';

/**
 * Weather data adapter.
 *
 * This file owns external weather calls and data labels only. It must never
 * decide whether the team rows; release decisions remain coach judgment.
 */
const compass = degrees => degrees == null
  ? '—'
  : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];

const rounded = (measurement, factor = 1) =>
  measurement?.value == null ? null : Math.round(measurement.value * factor);

const display = (value, unit) => value == null ? '—' : value + unit;

export async function getLiveConditions() {
  try {
    const observation = await fetch(
      'https://api.weather.gov/stations/KISP/observations/latest',
      { headers: { Accept: 'application/geo+json' } },
    ).then(response => {
      if (!response.ok) throw new Error('NWS observation unavailable');
      return response.json();
    });

    const data = observation.properties || {};
    return {
      kind: 'observation',
      eyebrow: 'LIVE OBSERVATION · KISP (ISLIP)',
      status: data.timestamp
        ? new Date(data.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · FAA / NWS'
        : 'Latest · FAA / NWS',
      sourceLabel: 'Open NOAA current conditions',
      sourceHref: 'https://forecast.weather.gov/MapClick.php?lat=40.9465&lon=-73.0693',
      metrics: [
        { value: display(rounded(data.windSpeed, 0.621371), ' mph'), label: 'WIND' },
        { value: display(rounded(data.windGust, 0.621371), ' mph'), label: 'GUST' },
        { value: data.temperature?.value == null ? '—' : Math.round(data.temperature.value * 9 / 5 + 32) + '°', label: 'AIR' },
        { value: compass(data.windDirection?.value), label: 'DIRECTION' },
      ],
      disclaimer: 'Observed at the listed station; harbor conditions can differ. Final release remains a coach decision.',
    };
  } catch {
    return getModelFallback();
  }
}

async function getModelFallback() {
  const { latitude, longitude, name } = APP.harbor;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude
    + '&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m'
    + '&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=' + encodeURIComponent(APP.timezone);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Model fallback unavailable');
  const current = (await response.json()).current;

  return {
    kind: 'model',
    eyebrow: 'CURRENT MODEL SNAPSHOT · ' + name.toUpperCase(),
    status: 'Fallback only · not an observation',
    sourceLabel: 'Check Port Jefferson marine station',
    sourceHref: 'https://www.ndbc.noaa.gov/station_page.php?station=PTJN6',
    metrics: [
      { value: Math.round(current.wind_speed_10m) + ' kt', label: 'WIND' },
      { value: Math.round(current.wind_gusts_10m) + ' kt', label: 'GUST' },
      { value: Math.round(current.temperature_2m) + '°', label: 'AIR' },
      { value: compass(current.wind_direction_10m), label: 'DIRECTION' },
    ],
    disclaimer: 'Modeled near-harbor conditions. Final release remains a coach decision.',
  };
}
