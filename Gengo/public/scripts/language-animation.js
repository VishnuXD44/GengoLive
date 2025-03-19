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
        
        // Slightly smaller text size to reduce impact on layout
        const size = Math.random() * (2.2 - 1.3) + 1.3;
        this.element.style.fontSize = `${size}rem`;
        
        // Add random color class
        this.element.classList.remove(...colorClasses);
        const randomColor = colorClasses[Math.floor(Math.random() * colorClasses.length)];
        this.element.classList.add(randomColor);
        
        // Add random font class
        this.element.classList.remove(...fontClasses);
        const randomFont = fontClasses[Math.floor(Math.random() * fontClasses.length)];
        this.element.classList.add(randomFont);
        
        // Get viewport dimensions to ensure text stays within bounds
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
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
            
            // Keep text well within the viewport horizontally
            startX = Math.random() * 70 + 15; // 15-85% of viewport width
            
            // Keep text at the bottom portion of the viewport for upward movement
            // But not too low that it causes scroll
            startY = Math.random() * 15 + 65; // 65-80% of viewport height
            
            // Convert to pixels for comparison
            const pixelX = (startX * viewportWidth) / 100;
            const pixelY = (startY * viewportHeight) / 100;
            
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
        
        // Very minimal rotation
        const rotation = Math.random() * 6 - 3; // -3 to 3 degrees
        this.element.style.transform = `rotate(${rotation}deg)`;
        
        // Shorter duration for less impact on scroll
        const duration = Math.random() * (16 - 10) + 10; // 10-16 seconds
        
        // Add a small random delay for more natural staggered effect
        const delay = Math.random() * 0.8;
        
        // Reset animation
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s ${delay}s ease-in-out forwards`;
    }
}

// Create and manage floating texts - reduce quantity
const createFloatingTexts = () => {
    const texts = [];
    // Reduce number of texts to minimize impact on layout
    const numTexts = 4; // Reduced from 6
    
    // Check viewport size and adjust number of texts for smaller screens
    const isMobile = window.innerWidth < 768;
    const actualNumTexts = isMobile ? 2 : numTexts;

    for (let i = 0; i < actualNumTexts; i++) {
        const text = new FloatingText();
        texts.push(text);
        
        // Store reference to instance for easier cleanup
        text.element.__instance = text;
        
        // Restart animation when it ends
        text.element.addEventListener('animationend', () => {
            setTimeout(() => {
                // Delay before restarting
                text.startAnimation();
            }, Math.random() * 2000 + 2000); // 2-4 second delay
        });

        // More widely staggered start times
        setTimeout(() => {
            text.startAnimation();
        }, i * 1500 + Math.random() * 1000); // Base delay plus random offset
    }
    
    return texts;
}

// Start animations when document is loaded, with checks to prevent viewport issues
document.addEventListener('DOMContentLoaded', () => {
    // Function to check if content fits in viewport
    const checkViewportFit = () => {
        const body = document.body;
        const html = document.documentElement;
        
        // Get maximum height of the page
        const height = Math.max(
            body.scrollHeight, body.offsetHeight,
            html.clientHeight, html.scrollHeight, html.offsetHeight
        );
        
        // Check if page height exceeds viewport significantly
        return height <= window.innerHeight * 1.1; // Allow 10% tolerance
    };
    
    // Create a cleanup function to remove elements when leaving the page
    let floatingTexts = [];
    
    // Wait a bit before starting animations to ensure all elements are loaded
    setTimeout(() => {
        // Only create floating texts if content fits viewport reasonably well
        if (checkViewportFit()) {
            floatingTexts = createFloatingTexts();
        } else {
            // If content doesn't fit viewport, use fewer texts with limited animation
            const reduced = Math.min(2, window.innerWidth < 768 ? 1 : 2);
            const container = document.createElement('div');
            container.style.cssText = 'position:absolute; bottom:20px; left:0; right:0; overflow:hidden; height:200px; pointer-events:none;';
            document.body.appendChild(container);
            
            for (let i = 0; i < reduced; i++) {
                const text = new FloatingText();
                container.appendChild(text.element);
                floatingTexts.push(text);
                text.element.__instance = text;
                
                text.element.addEventListener('animationend', () => {
                    setTimeout(() => text.startAnimation(), 3000);
                });
                
                setTimeout(() => text.startAnimation(), i * 2000);
            }
        }
    }, 1500);
    
    // Cleanup function for page transitions
    window.addEventListener('beforeunload', () => {
        document.querySelectorAll('.floating-text').forEach(element => {
            element.remove();
        });
    });
});
