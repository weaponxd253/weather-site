document.addEventListener('DOMContentLoaded', function() {
    // Demo-only frontend key. Production should proxy OpenWeather requests through a backend with an environment-held key.
    const apiKey = '1888b231e8cf712ed8c8809887434fe5';
    const requestTimeoutMs = 10000;
    const utils = window.WeatherUtils;
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
        unit: localStorage.getItem(storageKeys.unit) === 'imperial' ? 'imperial' : 'metric',
        currentLocation: null,
        currentWeather: null,
        forecast: null,
        recentSearches: utils.readStoredLocations(localStorage, storageKeys.recents, 5),
        favoriteLocations: utils.readStoredLocations(localStorage, storageKeys.favorites, 8),
        expandedForecastIndex: null,
        requestId: 0,
        activeWeatherController: null,
        activeSuggestionController: null
    };

    const awesomplete = new Awesomplete(cityInput, {
        minChars: 2,
        autoFirst: true
    });

    setTimeout(hideSplashScreen, 800);
    renderUnitToggle();
    renderSavedLocations();
    updateNetworkStatus();

    cityInput.addEventListener('input', function() {
        const query = cityInput.value.trim();
        clearCity.classList.toggle('hidden', query.length === 0);
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            citySuggestions = [];
            awesomplete.list = [];
            suggestionStatus.textContent = '';
            showLoadingSuggestions(false);
            abortController('activeSuggestionController');
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
        abortController('activeSuggestionController');
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

    window.addEventListener('offline', updateNetworkStatus);
    window.addEventListener('online', function() {
        updateNetworkStatus();
        displayError('Back online. You can refresh the weather now.');
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
        if (!navigator.onLine) {
            suggestionStatus.textContent = 'You are offline.';
            return;
        }

        abortController('activeSuggestionController');
        appState.activeSuggestionController = new AbortController();
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=8&appid=${apiKey}`;
        console.log('Fetching city suggestions from URL:', url);

        showLoadingSuggestions(true);
        suggestionStatus.textContent = 'Looking up cities...';

        fetchJson(url, appState.activeSuggestionController.signal)
            .then(data => {
                citySuggestions = utils.normalizeGeocodingResults(data, 5).map(city => ({
                    label: city.label,
                    value: city
                }));
                awesomplete.list = citySuggestions.map(suggestion => suggestion.label);
                suggestionStatus.textContent = citySuggestions.length ? '' : 'No matching cities found.';
            })
            .catch(error => {
                if (error.name === 'AbortError') {
                    return;
                }
                console.error('Error fetching city suggestions:', error);
                citySuggestions = [];
                awesomplete.list = [];
                suggestionStatus.textContent = utils.mapFetchError(error);
            })
            .finally(() => showLoadingSuggestions(false));
    }

    function handleWeatherSubmit() {
        const input = cityInput.value.trim();

        if (input === '') {
            displayError('Please enter a city name.');
            cityInput.focus();
            return;
        }
        if (!navigator.onLine) {
            displayError('You are offline. Showing the last loaded weather, if available.');
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
        if (!navigator.onLine) {
            displayError('You are offline. Check your connection and try again.');
            return;
        }

        const requestId = beginWeatherRequest();
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=8&appid=${apiKey}`;
        console.log('Fetching direct city data from URL:', url);

        displayLoading(true);

        fetchJson(url, appState.activeWeatherController.signal)
            .then(data => {
                if (!isLatestRequest(requestId)) {
                    return;
                }
                const locations = utils.normalizeGeocodingResults(data, 5);
                if (locations.length === 0) {
                    displayError('No matching city was found. Try adding a state or country.');
                    endWeatherRequest(requestId);
                    return;
                }
                fetchWeatherData(locations[0], requestId);
            })
            .catch(error => {
                if (!isLatestRequest(requestId) || error.name === 'AbortError') {
                    return;
                }
                console.error('Error fetching direct city data:', error);
                displayError(utils.mapFetchError(error));
                endWeatherRequest(requestId);
            });
    }

    function fetchWeatherData(location, existingRequestId) {
        const normalizedLocation = utils.normalizeLocation(location);
        if (!normalizedLocation) {
            displayError('That location could not be used. Please choose another city.');
            endWeatherRequest(existingRequestId);
            return;
        }
        if (!navigator.onLine) {
            displayError('You are offline. Check your connection and try again.');
            endWeatherRequest(existingRequestId);
            return;
        }

        const requestId = existingRequestId || beginWeatherRequest();
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

        Promise.all([
            fetchJson(apiUrlMetric, appState.activeWeatherController.signal),
            fetchJson(apiUrlImperial, appState.activeWeatherController.signal)
        ])
            .then(data => {
                if (!isLatestRequest(requestId)) {
                    return;
                }
                const dataMetric = utils.normalizeWeatherPayload(data[0]);
                const dataImperial = utils.normalizeWeatherPayload(data[1]);
                appState.currentLocation = utils.enrichLocation(normalizedLocation, dataMetric);
                appState.currentWeather = { metric: dataMetric, imperial: dataImperial };
                appState.forecast = null;
                appState.expandedForecastIndex = null;
                addRecentSearch(appState.currentLocation);
                renderCurrentWeather();
                fetchForecast(lat, lon, requestId);
            })
            .catch(error => {
                if (!isLatestRequest(requestId) || error.name === 'AbortError') {
                    return;
                }
                console.error('Error:', error);
                displayError(utils.mapFetchError(error));
                endWeatherRequest(requestId);
            });
    }

    function fetchForecast(lat, lon, requestId) {
        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;

        Promise.all([
            fetchJson(apiUrlMetric, appState.activeWeatherController.signal),
            fetchJson(apiUrlImperial, appState.activeWeatherController.signal)
        ])
            .then(data => {
                if (!isLatestRequest(requestId)) {
                    return;
                }
                appState.forecast = {
                    metric: utils.normalizeForecastPayload(data[0]),
                    imperial: utils.normalizeForecastPayload(data[1])
                };
                renderHourlyForecast();
                renderForecast();
            })
            .catch(error => {
                if (!isLatestRequest(requestId) || error.name === 'AbortError') {
                    return;
                }
                console.error('Error:', error);
                appState.forecast = { metric: { list: [] }, imperial: { list: [] } };
                renderHourlyForecast();
                renderForecast();
                displayError('Current weather loaded, but the forecast is unavailable.');
            })
            .finally(() => endWeatherRequest(requestId));
    }

    function renderCurrentWeather() {
        if (!appState.currentWeather || !appState.currentLocation) {
            return;
        }

        const dataMetric = appState.currentWeather.metric;
        const activeData = getActiveWeatherData();
        const activeUnit = getUnitSymbol();
        const sunrise = formatTime(dataMetric.sys.sunrise);
        const sunset = formatTime(dataMetric.sys.sunset);
        const condition = dataMetric.weather[0].description;
        const iconCode = dataMetric.weather[0].icon;
        const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        const updatedAt = formatTime(dataMetric.dt);

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
        const hours = Array.isArray(forecast.list) ? forecast.list.slice(0, 8) : [];
        if (hours.length === 0) {
            hourlyForecast.innerHTML = '<p class="empty-state">Hourly forecast is unavailable for this location.</p>';
            hourlyContainer.classList.add('visible');
            return;
        }

        hours.forEach((hourData, index) => {
            const timeText = formatTime(hourData.dt, { hour: 'numeric' });
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
        const activeList = Array.isArray(activeForecast.list) ? activeForecast.list : [];
        const metricList = Array.isArray(metricForecast.list) ? metricForecast.list : [];
        const days = activeList.filter((_, index) => index % 8 === 0).slice(0, 5);
        const metricDays = metricList.filter((_, index) => index % 8 === 0).slice(0, 5);

        if (days.length === 0) {
            forecastContainer.innerHTML = '<p class="empty-state">5-day forecast is unavailable for this location.</p>';
            forecastContainerParent.classList.add('visible');
            return;
        }

        days.forEach((dayData, index) => {
            const metricDay = metricDays[index] || dayData;
            const dateText = formatDate(dayData.dt);
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

        appState.recentSearches = utils.writeStoredLocations(localStorage, storageKeys.recents, [location, ...appState.recentSearches], 5);
        renderSavedLocations();
    }

    function toggleCurrentFavorite() {
        if (!appState.currentLocation) {
            return;
        }

        const isFavorite = appState.favoriteLocations.some(item => item.key === appState.currentLocation.key);
        const favorites = isFavorite
            ? appState.favoriteLocations.filter(item => item.key !== appState.currentLocation.key)
            : [appState.currentLocation, ...appState.favoriteLocations];
        appState.favoriteLocations = utils.writeStoredLocations(localStorage, storageKeys.favorites, favorites, 8);
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

    function formatTime(timestamp, options) {
        return new Date(timestamp * 1000).toLocaleTimeString([], options || { hour: 'numeric', minute: '2-digit' });
    }

    function formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
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
        weatherInfo.classList.toggle('is-loading', show);
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

    function updateNetworkStatus() {
        if (!navigator.onLine) {
            displayError('You are offline. Existing weather remains visible, but new searches need a connection.');
        }
    }

    function beginWeatherRequest() {
        abortController('activeWeatherController');
        appState.activeWeatherController = new AbortController();
        appState.requestId += 1;
        return appState.requestId;
    }

    function isLatestRequest(requestId) {
        return requestId === appState.requestId;
    }

    function endWeatherRequest(requestId) {
        if (!requestId || isLatestRequest(requestId)) {
            displayLoading(false);
            weatherInfo.classList.remove('is-loading');
            hourlyContainer.classList.remove('is-loading');
            forecastContainerParent.classList.remove('is-loading');
        }
    }

    function abortController(name) {
        if (appState[name]) {
            appState[name].abort();
            appState[name] = null;
        }
    }

    function fetchJson(url, signal) {
        const timeoutController = new AbortController();
        const timeout = setTimeout(() => timeoutController.abort(), requestTimeoutMs);
        const onAbort = () => timeoutController.abort();
        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        return fetch(url, { signal: timeoutController.signal })
            .then(async response => {
                const text = await response.text();
                let data = null;
                try {
                    data = text ? JSON.parse(text) : null;
                } catch (error) {
                    throw new utils.WeatherServiceError('Weather service returned malformed data.', { status: response.status, code: 'bad_payload' });
                }
                if (!response.ok) {
                    throw new utils.WeatherServiceError(data && data.message ? data.message : 'Weather service returned an error.', { status: response.status, code: 'api_error' });
                }
                return data;
            })
            .catch(error => {
                if (timeoutController.signal.aborted && !(signal && signal.aborted)) {
                    throw new utils.WeatherServiceError('Request timed out.', { code: 'timeout' });
                }
                throw error;
            })
            .finally(() => {
                clearTimeout(timeout);
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
            });
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



