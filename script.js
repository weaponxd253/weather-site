document.addEventListener('DOMContentLoaded', function() {
    const apiKey = '1888b231e8cf712ed8c8809887434fe5';
    const splashScreen = document.getElementById('splash-screen');
    const cityInput = document.getElementById('city-input');
    const clearCity = document.getElementById('clear-city');
    const getWeatherButton = document.getElementById('get-weather');
    const getWeatherLabel = document.getElementById('get-weather-label');
    const themeLabel = document.getElementById('theme-label');
    const suggestionStatus = document.getElementById('suggestion-status');
    const geolocationPermission = document.getElementById('geolocation-permission');
    const geolocationAllow = document.getElementById('geolocation-allow');
    const geolocationDeny = document.getElementById('geolocation-deny');
    const unitCButton = document.getElementById('unit-c');
    const unitFButton = document.getElementById('unit-f');
    const recentSearchesContainer = document.getElementById('recent-searches');
    const favoriteLocationsContainer = document.getElementById('favorite-locations');
    const favoriteCurrentButton = document.getElementById('favorite-current');
    const weatherInfo = document.getElementById('weather-info');
    const hourlyContainer = document.getElementById('hourly-container');
    const forecastContainerParent = document.getElementById('forecast-container');

    let citySuggestions = [];
    let debounceTimer;
    let errorTimer;

    const storageKeys = {
        unit: 'weatherPreferredUnit',
        recents: 'weatherRecentSearches',
        favorites: 'weatherFavoriteLocations'
    };
    const weatherThemeClasses = ['clear-theme', 'cloudy-theme', 'rain-theme', 'storm-theme', 'snowy-theme', 'night-theme', 'sunny-theme', 'rainy-theme'];
    const appState = {
        unit: localStorage.getItem(storageKeys.unit) || 'metric',
        currentLocation: null,
        currentWeather: null,
        forecast: null,
        recentSearches: readStoredLocations(storageKeys.recents),
        favoriteLocations: readStoredLocations(storageKeys.favorites),
        expandedForecastIndex: null
    };

    const states = {
        'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado',
        'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
        'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
        'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
        'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
        'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
        'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota',
        'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
        'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
    };

    const awesomplete = new Awesomplete(cityInput, {
        minChars: 2,
        autoFirst: true
    });

    setTimeout(hideSplashScreen, 800);
    renderUnitToggle();
    renderSavedLocations();

    cityInput.addEventListener('input', function() {
        const query = cityInput.value.trim();
        clearCity.classList.toggle('hidden', query.length === 0);
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            citySuggestions = [];
            awesomplete.list = [];
            suggestionStatus.textContent = '';
            showLoadingSuggestions(false);
            return;
        }

        debounceTimer = setTimeout(() => fetchCitySuggestions(query), 300);
    });

    cityInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleWeatherSubmit();
        }
    });

    clearCity.addEventListener('click', function() {
        cityInput.value = '';
        citySuggestions = [];
        awesomplete.list = [];
        suggestionStatus.textContent = '';
        clearCity.classList.add('hidden');
        cityInput.focus();
    });

    getWeatherButton.addEventListener('click', handleWeatherSubmit);
    unitCButton.addEventListener('click', () => setUnit('metric'));
    unitFButton.addEventListener('click', () => setUnit('imperial'));
    favoriteCurrentButton.addEventListener('click', toggleCurrentFavorite);

    document.getElementById('theme-switcher').addEventListener('click', function() {
        const isDark = document.body.classList.toggle('dark-mode');
        themeLabel.textContent = isDark ? 'Light' : 'Theme';
        this.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch theme');
    });

    document.addEventListener('click', function(event) {
        const savedButton = event.target.closest('[data-location-key]');
        if (savedButton) {
            const source = savedButton.dataset.locationSource;
            const key = savedButton.dataset.locationKey;
            const collection = source === 'favorite' ? appState.favoriteLocations : appState.recentSearches;
            const location = collection.find(item => item.key === key);
            if (location) {
                cityInput.value = location.label;
                clearCity.classList.remove('hidden');
                fetchWeatherData(location);
            }
            return;
        }

        const forecastButton = event.target.closest('[data-forecast-index]');
        if (forecastButton) {
            const index = Number(forecastButton.dataset.forecastIndex);
            appState.expandedForecastIndex = appState.expandedForecastIndex === index ? null : index;
            renderForecast();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeGeolocationPrompt(true);
            hideError();
            if (appState.expandedForecastIndex !== null) {
                appState.expandedForecastIndex = null;
                renderForecast();
            }
        }
    });

    function hideSplashScreen() {
        splashScreen.classList.add('hidden');
    }

    function fetchCitySuggestions(query) {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`;
        console.log('Fetching city suggestions from URL:', url);

        showLoadingSuggestions(true);
        suggestionStatus.textContent = 'Looking up cities...';

        fetch(url)
            .then(ensureOkResponse)
            .then(response => response.json())
            .then(data => {
                citySuggestions = data.map(city => ({
                    label: formatCityLabel(city),
                    value: normalizeLocation(city)
                }));

                awesomplete.list = citySuggestions.map(suggestion => suggestion.label);
                suggestionStatus.textContent = citySuggestions.length ? '' : 'No matching cities found.';
                showLoadingSuggestions(false);
            })
            .catch(error => {
                console.error('Error fetching city suggestions:', error);
                citySuggestions = [];
                awesomplete.list = [];
                suggestionStatus.textContent = 'Suggestions are unavailable right now.';
                showLoadingSuggestions(false);
            });
    }

    function handleWeatherSubmit() {
        const input = cityInput.value.trim();

        if (input === '') {
            displayError('Please enter a city name.');
            cityInput.focus();
            return;
        }

        const selectedCity = citySuggestions.find(suggestion => suggestion.label === input);
        if (selectedCity) {
            fetchWeatherData(selectedCity.value);
            return;
        }

        fetchDirectCity(input);
    }

    function fetchDirectCity(query) {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`;
        console.log('Fetching direct city data from URL:', url);

        displayLoading(true);

        fetch(url)
            .then(ensureOkResponse)
            .then(response => response.json())
            .then(data => {
                if (data.length === 0) {
                    displayLoading(false);
                    displayError('No matching city was found. Try adding a state or country.');
                    return;
                }

                fetchWeatherData(normalizeLocation(data[0]));
            })
            .catch(error => {
                console.error('Error fetching direct city data:', error);
                displayLoading(false);
                displayError('Failed to fetch city data. Please try again.');
            });
    }

    function fetchWeatherData(location) {
        const normalizedLocation = normalizeLocation(location);
        const { lat, lon } = normalizedLocation;
        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;

        hideSplashScreen();
        displayLoading(true);
        hourlyContainer.classList.remove('visible');
        forecastContainerParent.classList.remove('visible');
        hourlyContainer.classList.add('is-loading');
        forecastContainerParent.classList.add('is-loading');
        weatherInfo.classList.add('is-loading');

        Promise.all([fetch(apiUrlMetric), fetch(apiUrlImperial)])
            .then(responses => Promise.all(responses.map(ensureOkResponse)))
            .then(responses => Promise.all(responses.map(response => response.json())))
            .then(data => {
                const [dataMetric, dataImperial] = data;
                ensureWeatherPayload(dataMetric);
                ensureWeatherPayload(dataImperial);
                appState.currentLocation = enrichLocation(normalizedLocation, dataMetric);
                appState.currentWeather = { metric: dataMetric, imperial: dataImperial };
                appState.expandedForecastIndex = null;
                addRecentSearch(appState.currentLocation);
                renderCurrentWeather();
                fetchForecast(lat, lon);
            })
            .catch(error => {
                console.error('Error:', error);
                displayError(error.message || 'Failed to fetch weather. Please try again.');
            })
            .finally(() => {
                displayLoading(false);
                weatherInfo.classList.remove('is-loading');
            });
    }

    function fetchForecast(lat, lon) {
        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;

        Promise.all([fetch(apiUrlMetric), fetch(apiUrlImperial)])
            .then(responses => Promise.all(responses.map(ensureOkResponse)))
            .then(responses => Promise.all(responses.map(response => response.json())))
            .then(data => {
                appState.forecast = { metric: data[0], imperial: data[1] };
                renderHourlyForecast();
                renderForecast();
            })
            .catch(error => {
                console.error('Error:', error);
                displayError('Current weather loaded, but the forecast is unavailable.');
            })
            .finally(() => {
                hourlyContainer.classList.remove('is-loading');
                forecastContainerParent.classList.remove('is-loading');
            });
    }

    function renderCurrentWeather() {
        if (!appState.currentWeather) {
            return;
        }

        const dataMetric = appState.currentWeather.metric;
        const dataImperial = appState.currentWeather.imperial;
        const activeData = getActiveWeatherData();
        const activeUnit = getUnitSymbol();
        const sunrise = new Date(dataMetric.sys.sunrise * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const sunset = new Date(dataMetric.sys.sunset * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const condition = dataMetric.weather[0].description;
        const iconCode = dataMetric.weather[0].icon;
        const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        const updatedAt = new Date(dataMetric.dt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        document.getElementById('location-name').textContent = appState.currentLocation.label;
        document.getElementById('temperature').innerHTML = `${Math.round(activeData.main.temp)}&deg;${activeUnit}`;
        document.getElementById('weather').textContent = condition;
        document.getElementById('weather-meta').textContent = `Updated ${updatedAt}`;
        document.getElementById('feels-like').innerHTML = `${Math.round(activeData.main.feels_like)}&deg;${activeUnit}`;
        document.getElementById('humidity').textContent = `${dataMetric.main.humidity}%`;
        document.getElementById('wind-speed').innerHTML = formatWind(activeData.wind.speed);
        document.getElementById('sunrise').textContent = sunrise;
        document.getElementById('sunset').textContent = sunset;
        document.getElementById('weather-icon').src = iconUrl;
        document.getElementById('weather-icon').alt = condition;

        applyWeatherTheme(dataMetric.weather[0].main, iconCode);
        updateFavoriteButton();
        weatherInfo.classList.add('visible');
    }

    function renderHourlyForecast() {
        const hourlyForecast = document.getElementById('hourly-forecast');
        hourlyForecast.innerHTML = '';

        if (!appState.forecast) {
            hourlyContainer.classList.remove('visible');
            return;
        }

        const forecast = appState.forecast[appState.unit];
        forecast.list.slice(0, 8).forEach((hourData, index) => {
            const timeText = new Date(hourData.dt * 1000).toLocaleTimeString([], { hour: 'numeric' });
            const condition = hourData.weather[0].description;
            const iconUrl = `https://openweathermap.org/img/wn/${hourData.weather[0].icon}.png`;
            const card = document.createElement('article');
            card.className = 'hourly-card';
            card.style.animationDelay = `${index * 50}ms`;
            card.innerHTML = `
                <p class="hourly-time">${timeText}</p>
                <img src="${iconUrl}" alt="${condition}">
                <p class="hourly-temp">${Math.round(hourData.main.temp)}&deg;${getUnitSymbol()}</p>
                <p class="hourly-condition">${condition}</p>
            `;
            hourlyForecast.appendChild(card);
        });

        hourlyContainer.classList.add('visible');
    }

    function renderForecast() {
        const forecastContainer = document.getElementById('forecast');
        forecastContainer.innerHTML = '';

        if (!appState.forecast) {
            forecastContainerParent.classList.remove('visible');
            return;
        }

        const activeForecast = appState.forecast[appState.unit];
        const metricForecast = appState.forecast.metric;
        const days = activeForecast.list.filter((_, index) => index % 8 === 0).slice(0, 5);
        const metricDays = metricForecast.list.filter((_, index) => index % 8 === 0).slice(0, 5);

        days.forEach((dayData, index) => {
            const metricDay = metricDays[index];
            const date = new Date(dayData.dt * 1000);
            const dateText = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            const iconUrl = `https://openweathermap.org/img/wn/${dayData.weather[0].icon}@2x.png`;
            const condition = dayData.weather[0].description;
            const isToday = index === 0;
            const isExpanded = appState.expandedForecastIndex === index;

            const forecastDay = document.createElement('article');
            forecastDay.classList.add('forecast-day');
            if (isToday) {
                forecastDay.classList.add('is-today');
            }
            if (isExpanded) {
                forecastDay.classList.add('expanded');
            }
            forecastDay.style.animationDelay = `${index * 70}ms`;
            forecastDay.innerHTML = `
                <button class="forecast-toggle" type="button" data-forecast-index="${index}" aria-expanded="${isExpanded}">
                    <span class="forecast-card-main">
                        ${isToday ? '<span class="forecast-tag">Today</span>' : ''}
                        <span class="forecast-date">${dateText}</span>
                        <img src="${iconUrl}" alt="${condition}">
                        <span class="forecast-temp">${Math.round(dayData.main.temp)}&deg;${getUnitSymbol()}</span>
                        <span class="forecast-condition">${condition}</span>
                    </span>
                </button>
                <div class="forecast-details">
                    <span>Feels like ${Math.round(dayData.main.feels_like)}&deg;${getUnitSymbol()}</span>
                    <span>Humidity ${metricDay.main.humidity}%</span>
                    <span>Wind ${formatWind(dayData.wind.speed)}</span>
                </div>
            `;

            forecastContainer.appendChild(forecastDay);
        });

        forecastContainerParent.classList.add('visible');
    }

    function setUnit(unit) {
        if (appState.unit === unit) {
            return;
        }

        appState.unit = unit;
        localStorage.setItem(storageKeys.unit, unit);
        renderUnitToggle();
        renderCurrentWeather();
        renderHourlyForecast();
        renderForecast();
    }

    function renderUnitToggle() {
        const isMetric = appState.unit === 'metric';
        unitCButton.setAttribute('aria-pressed', String(isMetric));
        unitFButton.setAttribute('aria-pressed', String(!isMetric));
    }

    function renderSavedLocations() {
        renderLocationChips(recentSearchesContainer, appState.recentSearches, 'recent');
        renderLocationChips(favoriteLocationsContainer, appState.favoriteLocations, 'favorite');
    }

    function renderLocationChips(container, locations, source) {
        container.innerHTML = '';
        container.classList.toggle('hidden', locations.length === 0);

        locations.forEach(location => {
            const button = document.createElement('button');
            button.className = 'chip-button';
            button.type = 'button';
            button.dataset.locationKey = location.key;
            button.dataset.locationSource = source;
            button.textContent = location.label;
            container.appendChild(button);
        });
    }

    function addRecentSearch(location) {
        if (!location || !location.key) {
            return;
        }

        appState.recentSearches = [location, ...appState.recentSearches.filter(item => item.key !== location.key)].slice(0, 5);
        writeStoredLocations(storageKeys.recents, appState.recentSearches);
        renderSavedLocations();
    }

    function toggleCurrentFavorite() {
        if (!appState.currentLocation) {
            return;
        }

        const isFavorite = appState.favoriteLocations.some(item => item.key === appState.currentLocation.key);
        if (isFavorite) {
            appState.favoriteLocations = appState.favoriteLocations.filter(item => item.key !== appState.currentLocation.key);
        } else {
            appState.favoriteLocations = [appState.currentLocation, ...appState.favoriteLocations].slice(0, 8);
        }

        writeStoredLocations(storageKeys.favorites, appState.favoriteLocations);
        renderSavedLocations();
        updateFavoriteButton();
    }

    function updateFavoriteButton() {
        const isFavorite = appState.currentLocation && appState.favoriteLocations.some(item => item.key === appState.currentLocation.key);
        favoriteCurrentButton.disabled = !appState.currentLocation;
        favoriteCurrentButton.setAttribute('aria-pressed', String(Boolean(isFavorite)));
        favoriteCurrentButton.setAttribute('aria-label', isFavorite ? 'Remove current location from favorites' : 'Add current location to favorites');
    }

    function getActiveWeatherData() {
        return appState.currentWeather[appState.unit];
    }

    function getUnitSymbol() {
        return appState.unit === 'metric' ? 'C' : 'F';
    }

    function formatWind(speed) {
        return appState.unit === 'metric' ? `${speed.toFixed(1)} m/s` : `${speed.toFixed(1)} mph`;
    }

    function normalizeLocation(location) {
        const lat = Number(location.lat);
        const lon = Number(location.lon);
        const normalized = {
            name: location.name || '',
            state: location.state || '',
            country: location.country || '',
            lat,
            lon
        };
        normalized.label = location.label || formatLocationLabel(normalized);
        normalized.key = location.key || `${lat.toFixed(4)},${lon.toFixed(4)}`;
        return normalized;
    }

    function enrichLocation(location, weatherData) {
        const enriched = normalizeLocation(location);
        if (!enriched.name) {
            enriched.name = weatherData.name || 'Current location';
        }
        if (!enriched.country) {
            enriched.country = weatherData.sys.country || '';
        }
        enriched.label = formatLocationLabel(enriched);
        return enriched;
    }

    function formatCityLabel(city) {
        return formatLocationLabel(city);
    }

    function formatLocationLabel(location) {
        const state = getStateName(location.state);
        return [location.name, state, location.country].filter(Boolean).join(', ') || 'Current location';
    }

    function getStateName(state) {
        if (!state) {
            return '';
        }

        return states[state.toUpperCase()] || state;
    }

    function applyWeatherTheme(weather, iconCode) {
        const isNight = iconCode && iconCode.endsWith('n');
        const themes = {
            'Clear': 'clear-theme',
            'Clouds': 'cloudy-theme',
            'Rain': 'rain-theme',
            'Drizzle': 'rain-theme',
            'Thunderstorm': 'storm-theme',
            'Snow': 'snowy-theme',
            'Mist': 'cloudy-theme',
            'Smoke': 'cloudy-theme',
            'Haze': 'cloudy-theme',
            'Dust': 'cloudy-theme',
            'Fog': 'cloudy-theme',
            'Sand': 'cloudy-theme',
            'Ash': 'cloudy-theme',
            'Squall': 'storm-theme',
            'Tornado': 'storm-theme'
        };
        const theme = isNight ? 'night-theme' : themes[weather] || 'clear-theme';

        document.body.classList.remove(...weatherThemeClasses);
        document.body.classList.add(theme);
    }

    function displayLoading(show) {
        document.getElementById('loading-spinner').style.display = show ? 'block' : 'none';
        getWeatherButton.disabled = show;
        getWeatherLabel.textContent = show ? 'Loading...' : 'Get Weather';
        if (show) {
            weatherInfo.classList.add('is-loading');
        } else {
            weatherInfo.classList.remove('is-loading');
        }
    }

    function showLoadingSuggestions(show) {
        document.getElementById('loading-suggestions-spinner').style.display = show ? 'block' : 'none';
    }

    function displayError(message) {
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = message;
        errorMessage.classList.add('visible');
        clearTimeout(errorTimer);
        errorTimer = setTimeout(hideError, 5000);
    }

    function hideError() {
        const errorMessage = document.getElementById('error-message');
        errorMessage.classList.remove('visible');
    }

    function ensureOkResponse(response) {
        if (!response.ok) {
            throw new Error('Weather service returned an error. Please try again.');
        }

        return response;
    }

    function ensureWeatherPayload(data) {
        if (!data || Number(data.cod) >= 400) {
            throw new Error(data && data.message ? data.message : 'Weather data was unavailable.');
        }
    }

    function readStoredLocations(key) {
        try {
            const stored = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(stored) ? stored.map(normalizeLocation).filter(location => Number.isFinite(location.lat) && Number.isFinite(location.lon)) : [];
        } catch (error) {
            console.warn('Failed to read stored locations:', error);
            return [];
        }
    }

    function writeStoredLocations(key, locations) {
        localStorage.setItem(key, JSON.stringify(locations));
    }

    function closeGeolocationPrompt(rememberChoice) {
        geolocationPermission.classList.add('hidden');
        if (rememberChoice) {
            sessionStorage.setItem('weatherLocationPromptDismissed', 'true');
        }
    }

    if (navigator.geolocation && !sessionStorage.getItem('weatherLocationPromptDismissed')) {
        setTimeout(() => geolocationPermission.classList.remove('hidden'), 900);

        geolocationAllow.addEventListener('click', function() {
            closeGeolocationPrompt(true);
            displayLoading(true);
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    fetchWeatherData({
                        name: 'Current location',
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                function(error) {
                    console.error('Error fetching geolocation:', error);
                    displayLoading(false);
                    displayError('Location access was denied. Search for a city instead.');
                }
            );
        });

        geolocationDeny.addEventListener('click', function() {
            closeGeolocationPrompt(true);
        });
    } else if (!navigator.geolocation) {
        displayError('Geolocation is not supported by this browser. Search for a city instead.');
    }
});
