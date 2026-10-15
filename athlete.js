const tz = 'America/New_York';
const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=40.9465&longitude=-73.0693&current=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&forecast_days=2&wind_speed_unit=kn&temperature_unit=fahrenheit&timezone=America%2FNew_York';
const view = document.getElementById('athlete-view');

async function load() {
  const [schedule, weather] = await Promise.all([
    fetch('/api/console?view=athlete', { credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null),
    fetch(weatherUrl)
      .then(response => response.ok ? response.json() : null)
      .catch(() => null),
  ]);
  window.renderAthleteView(view, schedule, weather);
}

load().catch(() => {
  view.replaceChildren();
  const card = document.createElement('section');
  card.className = 'card';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = 'Unable to load today’s view.';
  const message = document.createElement('p');
  message.textContent = 'Check your connection and try again.';
  card.append(title, message);
  view.append(card);
});
setInterval(load, 60000);
