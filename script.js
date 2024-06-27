document.addEventListener('DOMContentLoaded', function() {
    const apiKey = '1888b231e8cf712ed8c8809887434fe5'; 
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
                const suggestions = data.map(city => `${city.name}, ${city.state ? city.state + ', ' : ''}${city.country}`);
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
        const city = document.getElementById('city-input').value.trim();
        if (city === "") {
            displayError("Please enter a city name.");
            return;
        }

        const apiKey = '1888b231e8cf712ed8c8809887434fe5'; 
        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`;
        console.log('Fetching weather data from URL:', apiUrlMetric, apiUrlImperial); // Debug information

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

    function fetchForecast(lat, lon) {
        const apiKey = '1888b231e8cf712ed8c8809887434fe5'; 
        const apiUrlMetric = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const apiUrlImperial = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
        console.log('Fetching forecast data from URL:', apiUrlMetric, apiUrlImperial); // Debug information

        Promise.all([fetch(apiUrlMetric), fetch(apiUrlImperial)])
            .then(responses => Promise.all(responses.map(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.statusText}`);
                }
                return response.json();
            })))
            .then(data => {
                const [dataMetric, dataImperial] = data;
                console.log('Forecast data fetched:', dataMetric, dataImperial); // Debug information

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
