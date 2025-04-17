import authHandler from './auth.js';
import flashcardManager from './flashcardManager.js';

class LearnPage {
    constructor() {
        this.currentUser = null;
        this.flashcards = [];
        this.currentCategory = null;
        this.isAuthenticated = false;

        // DOM Elements
        this.loginForm = document.getElementById('loginForm');
        this.flashcardContainer = document.getElementById('flashcardContainer');
        this.categorySelect = document.getElementById('categorySelect');
        this.progressBar = document.getElementById('progressBar');
        this.authSection = document.getElementById('authSection');
        this.learnSection = document.getElementById('learnSection');

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

        // Category selection
        this.categorySelect?.addEventListener('change', () => {
            this.currentCategory = this.categorySelect.value;
            if (this.currentCategory) {
                this.loadFlashcards();
            } else {
                this.flashcardContainer.innerHTML = '';
            }
        });

        // Sign out button
        const signOutBtn = document.getElementById('signOutBtn');
        signOutBtn?.addEventListener('click', async () => {
            try {
                await authHandler.signOut();
                this.currentCategory = null;
                this.flashcards = [];
                this.updateUI();
            } catch (error) {
                this.showError('Failed to sign out. Please try again.');
            }
        });
    }

    async loadFlashcards() {
        if (!this.isAuthenticated || !this.currentCategory) return;

        const result = await flashcardManager.getFlashcards(this.currentCategory);
        if (result.success) {
            this.flashcards = result.flashcards;
            this.renderFlashcards();
        } else {
            this.showError(result.error);
        }
    }

    renderFlashcards() {
        if (!this.flashcardContainer) return;

        this.flashcardContainer.innerHTML = '';
        
        this.flashcards.forEach(flashcard => {
            const card = document.createElement('div');
            card.className = 'flashcard';
            card.innerHTML = `
                <div class="flashcard-inner">
                    <div class="flashcard-front">
                        <p>${flashcard.front || flashcard.front_text}</p>
                    </div>
                    <div class="flashcard-back">
                        <p>${flashcard.back || flashcard.back_text}</p>
                    </div>
                </div>
            `;

            // Add click listener to flip card
            card.addEventListener('click', () => {
                card.querySelector('.flashcard-inner').classList.toggle('flipped');
            });

            this.flashcardContainer.appendChild(card);
        });
    }

    async updateProgress() {
        if (!this.isAuthenticated || !this.currentCategory) return;

        const result = await flashcardManager.getUserProgress(this.currentCategory);
        if (result.success && result.progress.length > 0) {
            const progress = result.progress[0];
            this.updateProgressBar(progress);
        }
    }

    updateProgressBar(progress) {
        if (!this.progressBar) return;

        const percentage = (progress.completed_cards / progress.total_cards) * 100;
        this.progressBar.style.width = `${percentage}%`;
        this.progressBar.setAttribute('aria-valuenow', percentage);
    }

    updateUI() {
        if (this.isAuthenticated) {
            this.authSection?.classList.add('hidden');
            this.learnSection?.classList.remove('hidden');
            
            // Set default category to greetings if none selected
            if (!this.currentCategory) {
                this.currentCategory = 'greetings';
                if (this.categorySelect) {
                    this.categorySelect.value = 'greetings';
                }
            }
            
            this.loadFlashcards();
            this.updateProgress();
        } else {
            this.authSection?.classList.remove('hidden');
            this.learnSection?.classList.add('hidden');
        }
    }

    showError(message) {
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