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

const colorClasses = [
    'floating-text-pink',
    'floating-text-orange',
    'floating-text-blue',
    'floating-text-dark'
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
        
        // Random size between 1rem and 2.5rem
        const size = Math.random() * (2.5 - 1) + 1;
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
            startX = Math.random() * 80 + 10; // 10% to 90% of viewport width
            startY = Math.random() * 40 + 30; // 30% to 70% of viewport height
            
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
            
            // Prevent infinite loops - after 10 attempts, accept any position
            if (attempts > 10) {
                positionIsValid = true;
            }
        } while (!positionIsValid);
        
        this.element.style.left = `${startX}vw`;
        this.element.style.top = `${startY}vh`;
        
        // Random rotation between -15 and 15 degrees
        const rotation = Math.random() * 30 - 15;
        this.element.style.transform = `rotate(${rotation}deg)`;
        
        // Random duration between 8-15 seconds for smoother animation
        const duration = Math.random() * (15 - 8) + 8;
        
        // Add a small random delay for more natural staggered effect
        const delay = Math.random() * 0.5;
        
        // Reset animation
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s ${delay}s cubic-bezier(0.25, 0.1, 0.25, 1) forwards`;
    }
}

// Create and manage floating texts
const createFloatingTexts = () => {
    const texts = [];
    const numTexts = 8; // Reduced from 12
    
    // Check viewport size and adjust number of texts for smaller screens
    const isMobile = window.innerWidth < 768;
    const actualNumTexts = isMobile ? 4 : numTexts;

    for (let i = 0; i < actualNumTexts; i++) {
        const text = new FloatingText();
        texts.push(text);
        
        // Store reference to instance for easier cleanup
        text.element.__instance = text;
        
        // Restart animation when it ends
        text.element.addEventListener('animationend', () => {
            setTimeout(() => {
                // Small delay before restarting to avoid having all animations sync up
                text.startAnimation();
            }, Math.random() * 1000); // Random delay between 0-1000ms
        });

        // Stagger the start times more naturally
        setTimeout(() => {
            text.startAnimation();
        }, i * 600 + Math.random() * 400); // Base delay plus random offset
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
    }, 1000);
    
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
