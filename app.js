const ui = {
  clockTime: document.getElementById('clockTime'),
  clockDate: document.getElementById('clockDate'),
  weatherTemp: document.getElementById('weatherTemp'),
  weatherIcon: document.getElementById('weatherIcon'),
  weatherLocation: document.getElementById('weatherLocation'),
  forecast: document.getElementById('forecast'),
  weatherAlert: document.getElementById('weatherAlert'),
  speedValue: document.getElementById('speedValue'),
  gpsState: document.getElementById('gpsState'),
  heading: document.getElementById('heading'),
  accuracy: document.getElementById('accuracy'),
  tripDistance: document.getElementById('tripDistance'),
  tripDuration: document.getElementById('tripDuration'),
  avgSpeed: document.getElementById('avgSpeed'),
  maxSpeed: document.getElementById('maxSpeed'),
  tripStatus: document.getElementById('tripStatus'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  playMusicBtn: document.getElementById('playMusicBtn'),
};

const state = {
  tracking: false,
  watchId: null,
  startTime: null,
  totalDistanceM: 0,
  prevPoint: null,
  maxSpeedKmh: 0,
};

function updateClock() {
  const now = new Date();
  ui.clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  ui.clockDate.textContent = now.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: '2-digit',
  });
}

function toCompass(degrees) {
  if (degrees == null || Number.isNaN(degrees)) return 'N';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sa = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function onPosition(position) {
  const { latitude, longitude, speed, heading, accuracy } = position.coords;
  const time = position.timestamp;
  const currentSpeedKmh = Math.max(0, (speed ?? 0) * 3.6);

  if (state.prevPoint) {
    const point = { lat: latitude, lon: longitude, t: time };
    const delta = haversineMeters(state.prevPoint, point);
    if (delta < 200) {
      state.totalDistanceM += delta;
    }
    state.prevPoint = point;
  } else {
    state.prevPoint = { lat: latitude, lon: longitude, t: time };
  }

  state.maxSpeedKmh = Math.max(state.maxSpeedKmh, currentSpeedKmh);
  const elapsedMs = state.startTime ? Date.now() - state.startTime : 0;
  const avgSpeed = elapsedMs > 0 ? (state.totalDistanceM / 1000) / (elapsedMs / 3600000) : 0;

  ui.speedValue.textContent = Math.round(currentSpeedKmh);
  ui.heading.textContent = toCompass(heading);
  ui.accuracy.textContent = `${Math.round(accuracy ?? 0)} m`;
  ui.tripDistance.textContent = `${(state.totalDistanceM / 1000).toFixed(2)} km`;
  ui.tripDuration.textContent = formatDuration(elapsedMs);
  ui.avgSpeed.textContent = `${Math.round(avgSpeed)} km/h`;
  ui.maxSpeed.textContent = `${Math.round(state.maxSpeedKmh)} km/h`;
  ui.gpsState.textContent = 'GPS ON';
}

function onPositionError(err) {
  ui.gpsState.textContent = 'GPS ERROR';
  ui.tripStatus.textContent = `Location denied (${err.code})`;
}

function startTrip() {
  if (!navigator.geolocation) {
    ui.tripStatus.textContent = 'Geolocation unavailable';
    return;
  }

  state.tracking = true;
  state.startTime = Date.now();
  state.totalDistanceM = 0;
  state.prevPoint = null;
  state.maxSpeedKmh = 0;

  ui.tripStatus.textContent = 'Tracking...';
  ui.startBtn.disabled = true;
  ui.stopBtn.disabled = false;

  state.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000,
  });
}

function stopTrip() {
  state.tracking = false;
  if (state.watchId != null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  ui.tripStatus.textContent = 'Trip stopped';
  ui.gpsState.textContent = 'GPS OFF';
  ui.startBtn.disabled = false;
  ui.stopBtn.disabled = true;
}

async function loadWeather(lat, lon) {
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m,precipitation_probability&forecast_days=1&timezone=auto`,
  );
  const weather = await weatherRes.json();

  ui.weatherTemp.textContent = `${Math.round(weather.current.temperature_2m)}°C`;
  const isRainLikely = (weather.hourly.precipitation_probability?.slice(0, 6) || []).some((x) => x >= 60);
  ui.weatherIcon.textContent = isRainLikely ? '🌧️' : '⛅';

  ui.forecast.innerHTML = '';
  for (let i = 0; i < 4; i += 1) {
    const t = weather.hourly.time[i];
    const temp = weather.hourly.temperature_2m[i];
    const rain = weather.hourly.precipitation_probability[i];
    const row = document.createElement('div');
    row.className = 'forecast-item';
    row.innerHTML = `<span>${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>${Math.round(temp)}°C • ${rain}% rain</span>`;
    ui.forecast.appendChild(row);
  }

  ui.weatherAlert.textContent = isRainLikely
    ? 'Weather Alert: Rain likely in the next few hours.'
    : 'Road weather looks stable for the next few hours.';

  try {
    const geoRes = await fetch(`https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}`);
    const geo = await geoRes.json();
    const city = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.state || 'Current Area';
    ui.weatherLocation.textContent = `Location: ${city}`;
  } catch {
    ui.weatherLocation.textContent = 'Location: Current Area';
  }
}

function initWeatherFromLocation() {
  if (!navigator.geolocation) {
    ui.weatherAlert.textContent = 'Unable to access GPS for weather.';
    return;
  }

  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      await loadWeather(coords.latitude, coords.longitude);
    } catch {
      ui.weatherAlert.textContent = 'Weather service unavailable right now.';
    }
  }, () => {
    ui.weatherAlert.textContent = 'Allow location access to get local forecast.';
  }, {
    enableHighAccuracy: false,
    maximumAge: 60_000,
    timeout: 10_000,
  });
}

function launchSpotify() {
  // If Spotify app is installed, this deep link opens it directly.
  // Falls back to the web player if the app cannot be opened.
  const fallbackUrl = 'https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n';
  const appUrl = 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n';

  const startedAt = Date.now();
  window.location.href = appUrl;

  setTimeout(() => {
    if (Date.now() - startedAt < 1700) {
      window.open(fallbackUrl, '_blank', 'noopener');
    }
  }, 1200);
}

ui.startBtn.addEventListener('click', startTrip);
ui.stopBtn.addEventListener('click', stopTrip);
ui.playMusicBtn?.addEventListener('click', launchSpotify);

updateClock();
setInterval(updateClock, 1000);
setInterval(() => {
  if (state.tracking && state.startTime) {
    ui.tripDuration.textContent = formatDuration(Date.now() - state.startTime);
  }
}, 1000);

initWeatherFromLocation();
