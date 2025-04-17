import authHandler from './auth.js';
import mapManager from './mapManager.js';
import languageGenerator from './languageGenerator.js';

class LearnPage {
    constructor() {
        this.currentUser = null;
        this.flashcards = [];
        this.isAuthenticated = false;
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.flashcardContainer = document.getElementById('flashcardContainer');
        this.authSection = document.getElementById('authSection');
        this.learnSection = document.getElementById('learnSection');
        this.loginForm = document.getElementById('loginForm');

        this.init();
    }

    async init() {
        // Initialize auth handler
        await authHandler.init();

        // Set up auth state listener
        authHandler.onAuthStateChange(user => {
            this.currentUser = user;
            this.isAuthenticated = !!user;
            this.updateUI();
        });

        // Set up event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Login form submission
        this.loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = e.target.email.value;
            const password = e.target.password.value;
            
            try {
                const result = await authHandler.signIn(email, password);
                if (!result.success) {
                    this.showError(result.error);
                }
            } catch (error) {
                this.showError('Failed to sign in. Please try again.');
            }
        });

        // Sign out button
        const signOutBtn = document.getElementById('signOutBtn');
        signOutBtn?.addEventListener('click', async () => {
            try {
                await authHandler.signOut();
                this.updateUI();
            } catch (error) {
                this.showError('Failed to sign out. Please try again.');
            }
        });

        // Listen for flashcard generation requests
        document.addEventListener('generateFlashcards', async (e) => {
            console.log('Received generateFlashcards event:', e.detail);
            const { query, language, country } = e.detail;
            await this.generateFlashcards(query, language, country);
        });
    }

    async generateFlashcards(query, language, country) {
        if (!this.isAuthenticated) {
            console.warn('User not authenticated, cannot generate flashcards');
            return;
        }

        try {
            console.log('Starting flashcard generation for:', { query, language, country });
            // Show loading state
            this.showLoading(true);
            this.flashcardContainer.innerHTML = '';

            // Generate phrases using the language generator
            const phrases = await languageGenerator.generatePhrases(query, language, country);
            console.log('Generated phrases:', phrases);

            if (!phrases || phrases.length === 0) {
                console.warn('No phrases generated');
                this.flashcardContainer.innerHTML = `
                    <div class="no-flashcards">
                        <p>No phrases could be generated. Please try a different query.</p>
                    </div>`;
                return;
            }

            this.flashcards = phrases;
            this.renderFlashcards();

        } catch (error) {
            console.error('Flashcard generation error:', error);
            this.showError('Failed to generate flashcards. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    renderFlashcards() {
        if (!this.flashcardContainer) {
            console.error('Flashcard container not found');
            return;
        }

        console.log('Rendering flashcards:', this.flashcards);

        if (!this.flashcards.length) {
            console.log('No flashcards to render');
            this.flashcardContainer.innerHTML = `
                <div class="no-flashcards">
                    <p>No flashcards available. Try selecting a location on the map.</p>
                </div>`;
            return;
        }

        this.flashcardContainer.innerHTML = '';
        
        this.flashcards.forEach((flashcard, index) => {
            console.log(`Rendering flashcard ${index + 1}:`, flashcard);
            const card = document.createElement('div');
            card.className = 'flashcard';
            card.innerHTML = `
                <div class="flashcard-inner">
                    <div class="flashcard-front">
                        <p>${flashcard.front}</p>
                    </div>
                    <div class="flashcard-back">
                        <p>${flashcard.back}</p>
                    </div>
                </div>
            `;

            // Add click listener to flip card
            card.addEventListener('click', () => {
                card.querySelector('.flashcard-inner').classList.toggle('flipped');
            });

            this.flashcardContainer.appendChild(card);
        });

        console.log('Finished rendering flashcards');
    }

    updateUI() {
        if (this.isAuthenticated) {
            this.authSection?.classList.add('hidden');
            this.learnSection?.classList.remove('hidden');
            
            // Initialize map
            const mapContainer = document.getElementById('mapContainer');
            if (mapContainer) {
                mapManager.init(mapContainer);
            }
        } else {
            this.authSection?.classList.remove('hidden');
            this.learnSection?.classList.add('hidden');
        }
    }

    showLoading(show) {
        if (this.loadingIndicator) {
            this.loadingIndicator.classList.toggle('hidden', !show);
        }
    }

    showError(message) {
        console.error('Error:', message);
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
            setTimeout(() => {
                errorElement.classList.add('hidden');
            }, 5000);
        }
    }
}

// Initialize the learn page when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LearnPage();
}); 