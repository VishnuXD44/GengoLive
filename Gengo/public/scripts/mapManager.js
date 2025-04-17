import { isExplicit } from './contentFilter.js';

class MapManager {
    constructor() {
        this.map = null;
        this.currentMarker = null;
        this.popup = null;
    }

    async init(container) {
        try {
            // Get the Mapbox token from the server
            const response = await fetch('/api/config/mapbox');
            const { token } = await response.json();
            
            if (!token) {
                throw new Error('Mapbox token not found');
            }

            mapboxgl.accessToken = token;
            this.map = new mapboxgl.Map({
                container: container,
                style: 'mapbox://styles/mapbox/streets-v12',
                center: [0, 20], // Default center
                zoom: 2
            });

            this.setupMapClickHandler();
        } catch (error) {
            console.error('Failed to initialize map:', error);
            // Show error message to user
            const container = document.getElementById(container);
            if (container) {
                container.innerHTML = `
                    <div class="error-message">
                        Failed to load the map. Please try again later.
                    </div>
                `;
            }
        }
    }

    setupMapClickHandler() {
        this.map.on('click', async (e) => {
            const { lng, lat } = e.lngLat;
            
            // Remove existing marker and popup
            if (this.currentMarker) {
                this.currentMarker.remove();
            }
            if (this.popup) {
                this.popup.remove();
            }

            // Add new marker
            this.currentMarker = new mapboxgl.Marker()
                .setLngLat([lng, lat])
                .addTo(this.map);

            // Create popup with input field
            const popupContent = document.createElement('div');
            popupContent.className = 'map-popup';
            popupContent.innerHTML = `
                <input type="text" placeholder="What would you like to learn? (e.g., asking for directions)" id="learningInput">
                <button id="generateBtn">Generate Flashcards</button>
            `;

            this.popup = new mapboxgl.Popup({ offset: 25 })
                .setLngLat([lng, lat])
                .setDOMContent(popupContent)
                .addTo(this.map);

            // Get country and language information
            const countryInfo = await this.getCountryInfo(lat, lng);
            
            // Setup generate button click handler
            const generateBtn = popupContent.querySelector('#generateBtn');
            generateBtn.addEventListener('click', async () => {
                const input = popupContent.querySelector('#learningInput').value;
                
                // Check for explicit content
                if (await isExplicit(input)) {
                    alert('Please keep your queries appropriate and related to language learning.');
                    return;
                }

                // Generate flashcards
                const event = new CustomEvent('generateFlashcards', {
                    detail: {
                        query: input,
                        country: countryInfo.country,
                        language: countryInfo.language,
                        location: { lat, lng }
                    }
                });
                document.dispatchEvent(event);
            });
        });
    }

    async getCountryInfo(lat, lng) {
        try {
            // Get the token from the server for this request
            const tokenResponse = await fetch('/api/config/mapbox');
            const { token } = await tokenResponse.json();

            if (!token) {
                throw new Error('Mapbox token not found');
            }

            const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`);
            const data = await response.json();
            
            const country = data.features.find(f => f.place_type.includes('country'));
            const countryCode = country?.properties?.short_code?.toUpperCase() || 'US';
            
            // Get primary language for the country (you might want to expand this mapping)
            const languageMap = {
                'US': 'English',
                'ES': 'Spanish',
                'FR': 'French',
                'DE': 'German',
                'IT': 'Italian',
                'JP': 'Japanese',
                'CN': 'Chinese',
                // Add more mappings as needed
            };

            return {
                country: country?.place_name || 'Unknown',
                language: languageMap[countryCode] || 'English'
            };
        } catch (error) {
            console.error('Error getting country info:', error);
            return { country: 'Unknown', language: 'English' };
        }
    }
}

export default new MapManager(); 