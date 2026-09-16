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
const WIND_LIMITS = { E: 15, W: 15, S: 20, N: 10, NE: 10, NW: 15, SE: 15, SW: 15 };
const KPH_TO_KT = 0.539957;

const MARINE_ZONE = 'ANZ335';
const MARINE_URL = 'https://marine.weather.gov/MapClick.php?zoneid=' + MARINE_ZONE;

function rowingStatus({ windKt, gustKt, direction }) {
  const limit = WIND_LIMITS[direction] || 15;
  const gustLimit = limit + 7;
  if (windKt == null && gustKt == null) {
    return { tone: 'marginal', label: 'CONDITIONS UNKNOWN', detail: 'Use coach judgment before launching.' };
  }
  if ((windKt != null && windKt > limit) || (gustKt != null && gustKt > gustLimit)) {
    return { tone: 'poor', label: 'POOR CONDITIONS', detail: direction + ' limit ' + limit + ' kt; gust limit ' + gustLimit + ' kt.' };
  }
  if ((windKt != null && windKt >= limit * 0.8) || (gustKt != null && gustKt >= gustLimit * 0.8)) {
    return { tone: 'marginal', label: 'MARGINAL CONDITIONS', detail: direction + ' wind is near the rowing threshold.' };
  }
  return { tone: 'favorable', label: 'FAVORABLE CONDITIONS', detail: direction + ' wind is under the rowing threshold.' };
}

async function getMarineForecast() {
  const response = await fetch(
    'https://api.weather.gov/zones/forecast/' + MARINE_ZONE + '/forecast',
    { headers: { Accept: 'application/geo+json' } },
  );
  if (!response.ok) throw new Error('NWS marine forecast unavailable');

  const data = (await response.json()).properties || {};
  const periods = (data.periods || [])
    .slice(0, 2)
    .map(period => ({
      name: period.name || 'Forecast',
      text: period.detailedForecast || period.forecast || '',
    }))
    .filter(period => period.text);

  if (!periods.length) throw new Error('NWS marine forecast empty');

  return {
    eyebrow: 'PORT JEFFERSON MARINE · ' + MARINE_ZONE,
    periods,
    sourceLabel: 'NOAA marine forecast',
    sourceHref: MARINE_URL,
  };
}

export async function getLiveConditions() {
  let conditions;
  try {
    const observation = await fetch(
      'https://api.weather.gov/stations/KISP/observations/latest',
      { headers: { Accept: 'application/geo+json' } },
    ).then(response => {
      if (!response.ok) throw new Error('NWS observation unavailable');
      return response.json();
    });

    const data = observation.properties || {};
    const windKt = rounded(data.windSpeed, KPH_TO_KT);
    const gustKt = rounded(data.windGust, KPH_TO_KT);
    const direction = compass(data.windDirection?.value);
    const rowing = rowingStatus({ windKt, gustKt, direction });
    conditions = {
      kind: 'observation',
      eyebrow: 'LIVE OBSERVATION · KISP (ISLIP)',
      status: rowing.label,
      statusDetail: rowing.detail + ' ' + (data.timestamp
        ? new Date(data.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · FAA / NWS'
        : 'Latest · FAA / NWS'),
      tone: rowing.tone,
      sourceLabel: 'Open NOAA current conditions',
      sourceHref: 'https://forecast.weather.gov/MapClick.php?lat=40.9465&lon=-73.0693',
      metrics: [
        { value: display(windKt, ' kt'), label: 'WIND' },
        { value: display(gustKt, ' kt'), label: 'GUST' },
        { value: data.temperature?.value == null ? '—' : Math.round(data.temperature.value * 9 / 5 + 32) + '°', label: 'AIR' },
        { value: direction, label: 'DIRECTION' },
      ],
      disclaimer: 'Observed at KISP; harbor conditions can differ. Final release remains a coach decision.',
    };
  } catch {
    conditions = await getModelFallback();
  }

  try {
    conditions.marine = await getMarineForecast();
  } catch {
    // Keep the observation usable if the marine-zone feed is temporarily down.
  }

  return conditions;
}

async function getModelFallback() {
  const { latitude, longitude, name } = APP.harbor;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude
    + '&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m'
    + '&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=' + encodeURIComponent(APP.timezone);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Model fallback unavailable');
  const current = (await response.json()).current;
  const windKt = Math.round(current.wind_speed_10m);
  const gustKt = Math.round(current.wind_gusts_10m);
  const direction = compass(current.wind_direction_10m);
  const rowing = rowingStatus({ windKt, gustKt, direction });

  return {
    kind: 'model',
    eyebrow: 'CURRENT MODEL SNAPSHOT · ' + name.toUpperCase(),
    status: rowing.label,
    statusDetail: rowing.detail + ' Fallback only; not an observation.',
    tone: rowing.tone,
    sourceLabel: 'Open Port Jefferson marine forecast',
    sourceHref: MARINE_URL,
    metrics: [
      { value: windKt + ' kt', label: 'WIND' },
      { value: gustKt + ' kt', label: 'GUST' },
      { value: Math.round(current.temperature_2m) + '°', label: 'AIR' },
      { value: direction, label: 'DIRECTION' },
    ],
    disclaimer: 'Modeled near-harbor conditions. Final release remains a coach decision.',
  };
}
