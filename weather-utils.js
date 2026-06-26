(function(root, factory) {
    const utils = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = utils;
    }
    root.WeatherUtils = utils;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
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
    const stateNameToAbbreviation = Object.keys(states).reduce((acc, abbreviation) => {
        acc[states[abbreviation].toLowerCase()] = abbreviation;
        return acc;
    }, {});

    class WeatherServiceError extends Error {
        constructor(message, options) {
            super(message);
            this.name = 'WeatherServiceError';
            this.status = options && options.status;
            this.code = options && options.code;
        }
    }

    function normalizeSearchQuery(input) {
        return cleanText(input).replace(/\s+/g, ' ').replace(/,+$/g, '').trim();
    }

    function classifySearchInput(input) {
        const query = normalizeSearchQuery(input);
        if (!query) {
            return { type: 'empty', value: '' };
        }

        const usZipMatch = query.match(/^(\d{5})(?:-\d{4})?$/);
        if (usZipMatch) {
            return { type: 'us_zip', value: usZipMatch[1], country: 'US' };
        }

        if (/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(query)) {
            return { type: 'unsupported_postal', value: query.toUpperCase().replace(/\s+/g, ' '), country: 'CA' };
        }

        const stateCode = getUSStateCode(query);
        if (stateCode) {
            return { type: 'us_state', value: stateCode, label: states[stateCode] };
        }

        const cityState = parseCityState(query);
        if (cityState) {
            return { type: 'city_state', value: `${cityState.city},${cityState.stateCode},US`, city: cityState.city, state: cityState.stateCode, country: 'US' };
        }

        return { type: 'place', value: query };
    }

    function parseCityState(query) {
        const commaParts = query.split(',').map(part => part.trim()).filter(Boolean);
        if (commaParts.length >= 2) {
            const stateCode = getUSStateCode(commaParts[1]);
            if (stateCode && commaParts[0]) {
                return { city: commaParts[0], stateCode };
            }
        }

        const words = query.split(' ').filter(Boolean);
        if (words.length < 2) {
            return null;
        }

        for (let stateWordCount = Math.min(2, words.length - 1); stateWordCount >= 1; stateWordCount -= 1) {
            const possibleState = words.slice(words.length - stateWordCount).join(' ');
            const stateCode = getUSStateCode(possibleState);
            const city = words.slice(0, words.length - stateWordCount).join(' ');
            if (stateCode && city) {
                return { city, stateCode };
            }
        }

        return null;
    }

    function getUSStateCode(value) {
        const normalized = cleanText(value).replace(/\./g, '').toLowerCase();
        if (!normalized) {
            return '';
        }
        const upper = normalized.toUpperCase();
        if (states[upper]) {
            return upper;
        }
        return stateNameToAbbreviation[normalized] || '';
    }

    function getStateName(state) {
        if (!state) {
            return '';
        }
        const trimmed = String(state).trim();
        return states[trimmed.toUpperCase()] || trimmed;
    }

    function formatLocationLabel(location) {
        const state = getStateName(location && location.state);
        const name = cleanText(location && location.name);
        const country = cleanText(location && location.country);
        return [name, state, country].filter(Boolean).join(', ') || 'Current location';
    }

    function normalizeLocation(location) {
        if (!location || typeof location !== 'object') {
            return null;
        }
        if (location.lat === null || location.lat === undefined || location.lat === '' || location.lon === null || location.lon === undefined || location.lon === '') {
            return null;
        }
        const lat = Number(location.lat);
        const lon = Number(location.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }
        const normalized = {
            name: cleanText(location.name),
            state: cleanText(location.state),
            country: cleanText(location.country),
            lat,
            lon
        };
        normalized.label = cleanText(location.label) || formatLocationLabel(normalized);
        normalized.key = cleanText(location.key) || `${lat.toFixed(4)},${lon.toFixed(4)}`;
        return normalized;
    }

    function enrichLocation(location, weatherData) {
        const normalized = normalizeLocation(location) || normalizeLocation({ lat: weatherData && weatherData.coord && weatherData.coord.lat, lon: weatherData && weatherData.coord && weatherData.coord.lon });
        if (!normalized) {
            return null;
        }
        if (!normalized.name) {
            normalized.name = cleanText(weatherData && weatherData.name) || 'Current location';
        }
        if (!normalized.country) {
            normalized.country = cleanText(weatherData && weatherData.sys && weatherData.sys.country);
        }
        normalized.label = formatLocationLabel(normalized);
        return normalized;
    }

    function dedupeLocations(locations, limit) {
        const seen = new Set();
        const normalized = [];
        (Array.isArray(locations) ? locations : []).forEach(location => {
            const item = normalizeLocation(location);
            if (!item || seen.has(item.key)) {
                return;
            }
            seen.add(item.key);
            normalized.push(item);
        });
        return normalized.slice(0, limit || normalized.length);
    }

    function normalizeGeocodingResults(results, limit) {
        return dedupeLocations(Array.isArray(results) ? results : [], limit || 5);
    }

    function readStoredLocations(storage, key, limit) {
        try {
            const raw = storage.getItem(key);
            const parsed = JSON.parse(raw || '[]');
            return dedupeLocations(Array.isArray(parsed) ? parsed : [], limit || 8);
        } catch (error) {
            try {
                storage.removeItem(key);
            } catch (_) {
                // Storage might be unavailable; ignore cleanup failure.
            }
            return [];
        }
    }

    function writeStoredLocations(storage, key, locations, limit) {
        const normalized = dedupeLocations(locations, limit || 8);
        storage.setItem(key, JSON.stringify(normalized));
        return normalized;
    }

    function normalizeWeatherPayload(data) {
        assertServicePayload(data);
        const weather = Array.isArray(data.weather) && data.weather[0] ? data.weather[0] : {};
        const main = data.main && typeof data.main === 'object' ? data.main : {};
        const wind = data.wind && typeof data.wind === 'object' ? data.wind : {};
        const sys = data.sys && typeof data.sys === 'object' ? data.sys : {};
        const coord = data.coord && typeof data.coord === 'object' ? data.coord : {};
        const temp = numberOrNull(main.temp);
        const feelsLike = numberOrNull(main.feels_like);
        const humidity = numberOrNull(main.humidity);

        if (temp === null) {
            throw new WeatherServiceError('Weather data was missing temperature details.', { code: 'bad_payload' });
        }

        return {
            name: cleanText(data.name),
            dt: numberOrNow(data.dt),
            cod: Number(data.cod || 200),
            coord: {
                lat: numberOrNull(coord.lat),
                lon: numberOrNull(coord.lon)
            },
            weather: [{
                main: cleanText(weather.main) || 'Clear',
                description: cleanText(weather.description) || 'weather unavailable',
                icon: cleanText(weather.icon) || '01d'
            }],
            main: {
                temp,
                feels_like: feelsLike === null ? temp : feelsLike,
                humidity: humidity === null ? 0 : humidity
            },
            wind: {
                speed: numberOrZero(wind.speed)
            },
            sys: {
                country: cleanText(sys.country),
                sunrise: numberOrNow(sys.sunrise),
                sunset: numberOrNow(sys.sunset)
            }
        };
    }

    function normalizeForecastPayload(data) {
        assertServicePayload(data);
        const list = Array.isArray(data.list) ? data.list : [];
        return {
            cod: Number(data.cod || 200),
            list: list.map(normalizeForecastItem).filter(Boolean)
        };
    }

    function normalizeForecastItem(item) {
        try {
            return normalizeWeatherPayload({
                cod: 200,
                dt: item.dt,
                weather: item.weather,
                main: item.main,
                wind: item.wind,
                sys: {},
                coord: {}
            });
        } catch (_) {
            return null;
        }
    }

    function assertServicePayload(data) {
        if (!data || typeof data !== 'object') {
            throw new WeatherServiceError('Weather service returned malformed data.', { code: 'bad_payload' });
        }
        const code = Number(data.cod);
        if (Number.isFinite(code) && code >= 400) {
            throw new WeatherServiceError(cleanText(data.message) || 'Weather service returned an error.', { status: code, code: 'api_error' });
        }
    }

    function mapFetchError(error) {
        if (!error) {
            return 'Something went wrong. Please try again.';
        }
        if (error.name === 'AbortError' || error.code === 'timeout') {
            return 'The weather service took too long to respond. Please try again.';
        }
        if (error.status === 401) {
            return 'The weather API key was rejected. Check the app configuration.';
        }
        if (error.status === 404) {
            return 'No matching weather data was found for that location.';
        }
        if (error.status === 429) {
            return 'The weather service rate limit was reached. Please wait and try again.';
        }
        if (error.status >= 500) {
            return 'The weather service is having trouble right now. Please try again soon.';
        }
        if (error.code === 'bad_payload') {
            return error.message;
        }
        if (error instanceof TypeError) {
            return 'Network request failed. Check your connection and try again.';
        }
        return error.message || 'Something went wrong. Please try again.';
    }

    function cleanText(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function numberOrNull(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function numberOrZero(value) {
        const number = numberOrNull(value);
        return number === null ? 0 : number;
    }

    function numberOrNow(value) {
        const number = numberOrNull(value);
        return number === null ? Math.floor(Date.now() / 1000) : number;
    }

    return {
        WeatherServiceError,
        classifySearchInput,
        dedupeLocations,
        enrichLocation,
        formatLocationLabel,
        getStateName,
        getUSStateCode,
        mapFetchError,
        normalizeForecastPayload,
        normalizeGeocodingResults,
        normalizeLocation,
        normalizeSearchQuery,
        normalizeWeatherPayload,
        readStoredLocations,
        writeStoredLocations
    };
});
