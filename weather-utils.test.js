const assert = require('assert');
const utils = require('./weather-utils.js');

function createStorage(initial) {
    const data = { ...(initial || {}) };
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem(key, value) {
            data[key] = String(value);
        },
        removeItem(key) {
            delete data[key];
        },
        dump() {
            return { ...data };
        }
    };
}

(function normalizesAndDedupesLocations() {
    const locations = utils.normalizeGeocodingResults([
        { name: 'Lakewood', state: 'WA', country: 'US', lat: 47.17, lon: -122.52 },
        { name: 'Lakewood', state: 'Washington', country: 'US', lat: 47.17001, lon: -122.52001 },
        { name: 'Bad', lat: 'nope', lon: 1 }
    ], 5);

    assert.strictEqual(locations.length, 1);
    assert.strictEqual(locations[0].label, 'Lakewood, Washington, US');
})();

(function validatesStoredLocations() {
    const storage = createStorage({ saved: JSON.stringify([
        { label: 'Good', lat: 1, lon: 2 },
        { label: 'Duplicate', lat: 1, lon: 2 },
        { label: 'Broken', lat: null, lon: 2 }
    ]) });

    const locations = utils.readStoredLocations(storage, 'saved', 5);
    assert.strictEqual(locations.length, 1);
    assert.strictEqual(locations[0].key, '1.0000,2.0000');
})();

(function recoversFromMalformedStorage() {
    const storage = createStorage({ saved: '{bad json' });
    const locations = utils.readStoredLocations(storage, 'saved', 5);
    assert.deepStrictEqual(locations, []);
    assert.strictEqual(storage.getItem('saved'), null);
})();

(function normalizesWeatherPayloadFallbacks() {
    const payload = utils.normalizeWeatherPayload({
        cod: '200',
        main: { temp: 12.4 },
        wind: {},
        sys: {},
        weather: []
    });

    assert.strictEqual(payload.main.temp, 12.4);
    assert.strictEqual(payload.main.feels_like, 12.4);
    assert.strictEqual(payload.main.humidity, 0);
    assert.strictEqual(payload.wind.speed, 0);
    assert.strictEqual(payload.weather[0].icon, '01d');
})();

(function rejectsBadWeatherPayload() {
    assert.throws(() => utils.normalizeWeatherPayload({ cod: 401, message: 'bad key' }), /bad key/);
    assert.throws(() => utils.normalizeWeatherPayload({ cod: 200, main: {} }), /temperature/);
})();

(function normalizesForecastPayload() {
    const forecast = utils.normalizeForecastPayload({
        cod: '200',
        list: [
            { dt: 100, main: { temp: 5 }, wind: { speed: 2 }, weather: [{ description: 'clear sky', icon: '01d' }] },
            { dt: 200, main: {}, weather: [] }
        ]
    });

    assert.strictEqual(forecast.list.length, 1);
    assert.strictEqual(forecast.list[0].main.temp, 5);
})();

(function mapsFetchErrors() {
    assert.match(utils.mapFetchError(new utils.WeatherServiceError('no', { status: 401 })), /API key/);
    assert.match(utils.mapFetchError(new utils.WeatherServiceError('slow', { code: 'timeout' })), /too long/);
    assert.match(utils.mapFetchError(new TypeError('failed')), /Network/);
})();

console.log('weather-utils tests passed');
