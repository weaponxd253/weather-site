document.addEventListener('DOMContentLoaded', function() {
    const apiKey = '1888b231e8cf712ed8c8809887434fe5';
    const splashScreen = document.getElementById('splash-screen');
    const confirmationContainer = document.getElementById('confirmation-container');
    const confirmationMessage = document.getElementById('confirmation-message');
    const confirmationYes = document.getElementById('confirmation-yes');
    const confirmationNo = document.getElementById('confirmation-no');
    let confirmedLocation = null;

    function hideSplashScreen() {
        splashScreen.classList.add('hidden');
    }

    // Show the splash screen when the page loads
    splashScreen.classList.remove('hidden');

    // Fallback: hide the splash screen after 5 seconds in case of an error
    setTimeout(hideSplashScreen, 5000);

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
    const stateAbbreviations = Object.keys(states);
    const stateNames = Object.values(states);
    const stateNamesLower = stateNames.map(name => name.toLowerCase());

    const awesomplete = new Awesomplete(document.getElementById("city-input"), {
        minChars: 1,
        autoFirst: true
    });

    let debounceTimer;
    document.getElementById('city-input').addEventListener('input', function() {
        const query = this.value.trim();
        clearTimeout(debounceTimer);
        if (query.length >= 1) {
            debounceTimer = setTimeout(() => fetchCitySuggestions(query), 300);
        }
    });

    function fetchCitySuggestions(query) {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`;
        console.log('Fetching city suggestions from URL:', url);

        showLoadingSuggestions(true);

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('City suggestions fetched:', data);
                const suggestions = data.map(city => {
                    let state = city.state ? states[city.state.toUpperCase()] : '';
                    return `${city.name}, ${state ? state + ', ' : ''}${city.country}`;
                });
                stateAbbreviations.forEach(abbr => {
                    suggestions.push(`${abbr}`);
                    suggestions.push(`${states[abbr]}`);
                });
                awesomplete.list = suggestions;
                showLoadingSuggestions(false);
            })
            .catch(error => {
                console.error('Error fetching city suggestions:', error);
                showLoadingSuggestions(false);
            });
    }

    function showLoadingSuggestions(show) {
        document.getElementById('loading-suggestions-spinner').style.display = show ? 'block' : 'none';
    }

    document.getElementById('get-weather').addEventListener('click', function() {
        const input = document.getElementById('city-input').value.trim();
        if (input === "") {
            displayError("Please enter a city name.");
            return;
        }

        let location;
        const parts = input.split(',').map(part => part.trim());
        if (parts.length === 1) {
            location = parts[0];
        } else if (parts.length === 2) {
            const cityPart = parts[0];
            const statePart = parts[1];
            if (stateAbbreviations.includes(statePart.toUpperCase()) || stateNamesLower.includes(statePart.toLowerCase())) {
                const stateAbbr = stateAbbreviations.includes(statePart.toUpperCase()) ? statePart.toUpperCase() : stateAbbreviations[stateNamesLower.indexOf(statePart.toLowerCase())];
                location = `${cityPart},${stateAbbr},US`;
            } else {
                displayError("Please enter a valid city name and optionally a valid state abbreviation or name.");
                return;
            }
        } else if (parts.length === 3) {
            const cityPart = parts[0];
            const statePart = parts[1];
            const countryPart = parts[2];
            if ((stateAbbreviations.includes(statePart.toUpperCase()) || stateNamesLower.includes(statePart.toLowerCase())) && countryPart.toUpperCase() === 'US') {
                const stateAbbr = stateAbbreviations.includes(statePart.toUpperCase()) ? statePart.toUpperCase() : stateAbbreviations[stateNamesLower.indexOf(statePart.toLowerCase())];
                location = `${cityPart},${stateAbbr},${countryPart}`;
            } else {
                displayError("Please enter a valid city name, state abbreviation, and country code.");
                return;
            }
        } else {
            displayError("Please enter a valid city name and optionally a valid state abbreviation or name.");
            return;
        }

        // If location is not confirmed yet, show the confirmation container
        if (!confirmedLocation || confirmedLocation !== location) {
            confirmationMessage.textContent = `Did you mean: ${location}?`;
            confirmationContainer.classList.add('visible');
            confirmedLocation = location;
            return;
        }

        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`;
        console.log('Fetching weather data from URL:', apiUrlMetric, apiUrlImperial);

        displayLoading(true);

        Promise.all([fetch(apiUrlMetric), fetch(apiUrlImperial)])
            .then(responses => Promise.all(responses.map(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return response.json();
            })))
            .then(data => {
                displayLoading(false);
                hideSplashScreen();
                const [dataMetric, dataImperial] = data;
                console.log('Weather data fetched:', dataMetric, dataImperial);

                // Convert UNIX timestamp to local time
                const sunrise = new Date(dataMetric.sys.sunrise * 1000).toLocaleTimeString();
                const sunset = new Date(dataMetric.sys.sunset * 1000).toLocaleTimeString();

                document.getElementById('temperature').innerHTML =
                    `<span class="temperature">${dataMetric.main.temp}°C</span> / <span class="temperature">${dataImperial.main.temp}°F</span>`;
                document.getElementById('weather').textContent = dataMetric.weather[0].description;
                document.getElementById('humidity').textContent = dataMetric.main.humidity + '%';
                document.getElementById('wind-speed').innerHTML =
                    `<span class="temperature">${dataMetric.wind.speed} m/s</span> / <span class="temperature">${dataImperial.wind.speed} mph</span>`;
                document.getElementById('sunrise').textContent = sunrise;
                document.getElementById('sunset').textContent = sunset;
                const iconUrl = `https://openweathermap.org/img/wn/${dataMetric.weather[0].icon}@2x.png`;
                document.getElementById('weather-icon').src = iconUrl;

                // Apply weather theme based on weather condition
                applyWeatherTheme(dataMetric.weather[0].main);

                // Show weather info with animation
                const weatherInfo = document.getElementById('weather-info');
                weatherInfo.classList.add('visible');
                weatherInfo.style.display = 'block';

                // Fetch and display forecast data
                fetchForecast(dataMetric.coord.lat, dataMetric.coord.lon);
            })
            .catch(error => {
                displayLoading(false);
                displayError(error.message);
                console.error('Error:', error);
            });
    });

    document.getElementById('theme-switcher').addEventListener('click', function() {
        toggleTheme();
    });

    confirmationYes.addEventListener('click', function() {
        confirmationContainer.classList.remove('visible');
        document.getElementById('get-weather').click();
    });

    confirmationNo.addEventListener('click', function() {
        confirmationContainer.classList.remove('visible');
        confirmedLocation = null;
    });

    function fetchForecast(lat, lon) {
        const apiKey = '1888b231e8cf712ed8c8809887434fe5';
        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
        console.log('Fetching forecast data from URL:', apiUrlMetric, apiUrlImperial);

        Promise.all([fetch(apiUrlMetric), fetch(apiUrlImperial)])
            .then(responses => Promise.all(responses.map(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return response.json();
            })))
            .then(data => {
                const [dataMetric, dataImperial] = data;
                console.log('Forecast data fetched:', dataMetric, dataImperial);

                const forecastContainer = document.getElementById('forecast');
                forecastContainer.innerHTML = '';

                for (let i = 0; i < dataMetric.list.length; i += 8) {
                    const dayDataMetric = dataMetric.list[i];
                    const dayDataImperial = dataImperial.list[i];
                    const date = new Date(dayDataMetric.dt * 1000).toLocaleDateString();
                    const tempMetric = dayDataMetric.main.temp + '°C';
                    const tempImperial = dayDataImperial.main.temp + '°F';
                    const iconUrl = `https://openweathermap.org/img/wn/${dayDataMetric.weather[0].icon}.png`;

                    const forecastDay = document.createElement('div');
                    forecastDay.classList.add('forecast-day');
                    forecastDay.innerHTML = `
                        <p>${date}</p>
                        <img src="${iconUrl}" alt="Weather Icon">
                        <p><span class="temperature">${tempMetric}</span> / <span class="temperature">${tempImperial}</span></p>
                    `;

                    forecastContainer.appendChild(forecastDay);
                }

                const forecastContainerParent = document.getElementById('forecast-container');
                forecastContainerParent.classList.add('visible');
            })
            .catch(error => {
                displayError(error.message);
                console.error('Error:', error);
            });
    }

    function applyWeatherTheme(weather) {
        const themes = {
            'Clear': 'sunny-theme',
            'Clouds': 'sunny-theme',
            'Rain': 'rainy-theme',
            'Drizzle': 'rainy-theme',
            'Thunderstorm': 'rainy-theme',
            'Snow': 'snowy-theme'
        };

        const theme = themes[weather] || 'sunny-theme';
        document.body.className = document.body.className.replace(/sunny-theme|rainy-theme|snowy-theme/g, '');
        document.body.classList.add(theme);
    }

    function toggleTheme() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        const themes = ['sunny-theme', 'rainy-theme', 'snowy-theme'];
        const currentTheme = document.body.classList.value.match(/sunny-theme|rainy-theme|snowy-theme/);
        const currentIndex = themes.indexOf(currentTheme ? currentTheme[0] : '');
        const nextIndex = (currentIndex + 1) % themes.length;

        if (!isDarkMode) {
            document.body.classList.remove(...themes);
            document.body.classList.add(themes[nextIndex]);
        }
    }

    function displayLoading(show) {
        document.getElementById('loading-spinner').style.display = show ? 'block' : 'none';
    }

    function displayError(message) {
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = message;
        errorMessage.classList.add('visible');
        setTimeout(() => {
            errorMessage.classList.remove('visible');
        }, 5000);
    }
});
