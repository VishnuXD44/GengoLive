const greetings = [
    'こんにちは', // Japanese
    '안녕하세요', // Korean
    'Hola',      // Spanish
    'Bonjour',   // French
    'Ciao',      // Italian
    'Привет',    // Russian
    '你好',      // Chinese
    'नमस्ते',    // Hindi
    'Hallo',     // German
    'Olá',       // Portuguese
    'مرحبا',     // Arabic
    'Γεια σας',  // Greek
    'สวัสดี',    // Thai
    'שָׁלוֹם',    // Hebrew
    'Xin chào',  // Vietnamese
];

// Updated color classes to use pastel colors
const colorClasses = [
    'floating-text-earth',
    'floating-text-mauve',
    'floating-text-cream',
    'floating-text-sky',
    'floating-text-dream',
    'floating-text-awake',
    'floating-text-light'
];

const fontClasses = [
    'font-nunito',
    'font-space',
    'font-poppins',
    'font-montserrat'
];

class FloatingText {
    constructor() {
        this.element = document.createElement('div');
        this.element.className = 'floating-text';
        document.body.appendChild(this.element);
        this.startAnimation();
    }

    startAnimation() {
        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        this.element.textContent = greeting;
        
        // Slightly larger text size for better visibility with pastel colors
        const size = Math.random() * (2.8 - 1.5) + 1.5;
        this.element.style.fontSize = `${size}rem`;
        
        // Add random color class
        this.element.classList.remove(...colorClasses);
        const randomColor = colorClasses[Math.floor(Math.random() * colorClasses.length)];
        this.element.classList.add(randomColor);
        
        // Add random font class
        this.element.classList.remove(...fontClasses);
        const randomFont = fontClasses[Math.floor(Math.random() * fontClasses.length)];
        this.element.classList.add(randomFont);
        
        // Check for content elements we need to avoid
        const elementsToAvoid = [
            document.querySelector('.video-container'),
            document.querySelector('.logo-section'),
            document.querySelector('.features'),
            document.querySelector('.selection-container'),
            document.querySelector('.cta-section'),
            document.querySelector('.beginning-section'),
            document.querySelector('.contact-section')
        ].filter(element => element !== null);
        
        // Get the rectangles of all elements to avoid
        const rectsToAvoid = elementsToAvoid.map(element => element.getBoundingClientRect());
        
        // Random starting position (both X and Y), keeping within viewport bounds
        let startX, startY;
        let positionIsValid = false;
        let attempts = 0;
        
        do {
            attempts++;
            // More focused placement along the sides of the screen
            // This helps avoid important central content
            if (Math.random() > 0.5) {
                // Left or right side
                startX = Math.random() > 0.5 ? 
                    Math.random() * 20 + 5 :  // Left side (5-25%)
                    Math.random() * 20 + 75;  // Right side (75-95%)
            } else {
                // More centered but still avoiding main content
                startX = Math.random() * 60 + 20; // 20-80%
            }
            
            // Start lower on the page for upward movement
            startY = Math.random() * 20 + 70; // 70-90% of viewport height
            
            // Convert to pixels for comparison
            const pixelX = (startX * window.innerWidth) / 100;
            const pixelY = (startY * window.innerHeight) / 100;
            
            // Check if position overlaps with any element to avoid
            positionIsValid = true;
            for (const rect of rectsToAvoid) {
                if (pixelX >= rect.left && 
                    pixelX <= rect.right && 
                    pixelY >= rect.top && 
                    pixelY <= rect.bottom) {
                    positionIsValid = false;
                    break;
                }
            }
            
            // Prevent infinite loops - after 8 attempts, accept any position
            if (attempts > 8) {
                positionIsValid = true;
            }
        } while (!positionIsValid);
        
        this.element.style.left = `${startX}vw`;
        this.element.style.top = `${startY}vh`;
        
        // Minimal rotation for more elegant appearance
        const rotation = Math.random() * 10 - 5; // -5 to 5 degrees
        this.element.style.transform = `rotate(${rotation}deg)`;
        
        // Longer duration for smoother animation
        const duration = Math.random() * (20 - 12) + 12; // 12-20 seconds
        
        // Add a small random delay for more natural staggered effect
        const delay = Math.random() * 0.8;
        
        // Reset animation
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s ${delay}s ease-in-out forwards`;
    }
}

// Create and manage floating texts
const createFloatingTexts = () => {
    const texts = [];
    // Reduced number of texts for cleaner appearance
    const numTexts = 6;
    
    // Check viewport size and adjust number of texts for smaller screens
    const isMobile = window.innerWidth < 768;
    const actualNumTexts = isMobile ? 3 : numTexts;

    for (let i = 0; i < actualNumTexts; i++) {
        const text = new FloatingText();
        texts.push(text);
        
        // Store reference to instance for easier cleanup
        text.element.__instance = text;
        
        // Restart animation when it ends
        text.element.addEventListener('animationend', () => {
            setTimeout(() => {
                // Longer delay before restarting to keep animations sparse
                text.startAnimation();
            }, Math.random() * 2000 + 1000); // 1-3 second delay
        });

        // More widely staggered start times
        setTimeout(() => {
            text.startAnimation();
        }, i * 1200 + Math.random() * 800); // Base delay plus random offset
    }
    
    return texts;
}

// Start animations when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create a cleanup function to remove elements when leaving the page
    let floatingTexts = [];
    
    // Wait a bit before starting animations to ensure all elements are loaded
    setTimeout(() => {
        floatingTexts = createFloatingTexts();
    }, 1500);
    
    // Add window resize handler to reposition text if needed
    window.addEventListener('resize', () => {
        document.querySelectorAll('.floating-text').forEach(text => {
            const instance = text.__instance;
            if (instance) instance.startAnimation();
        });
    });
    
    // Cleanup function for page transitions
    window.addEventListener('beforeunload', () => {
        document.querySelectorAll('.floating-text').forEach(element => {
            element.remove();
        });
    });
});
