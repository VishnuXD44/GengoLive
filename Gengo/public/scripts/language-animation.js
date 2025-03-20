// First, let's add a class to identify index page
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on index.html
    if (window.location.pathname === '/' || 
        window.location.pathname.includes('index.html') || 
        window.location.pathname.endsWith('/')) {
        document.body.classList.add('index-page');
    }
});

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
    }

    startAnimation() {
        // Clear any existing animation
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        this.element.textContent = greeting;
        
        // Smaller text size
        const size = Math.random() * (2 - 1.2) + 1.2;
        this.element.style.fontSize = `${size}rem`;
        
        // Add random color class
        this.element.classList.remove(...colorClasses);
        const randomColor = colorClasses[Math.floor(Math.random() * colorClasses.length)];
        this.element.classList.add(randomColor);
        
        // Add random font class
        this.element.classList.remove(...fontClasses);
        const randomFont = fontClasses[Math.floor(Math.random() * fontClasses.length)];
        this.element.classList.add(randomFont);
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Position text at bottom of viewport, away from content
        const startX = Math.random() * 80 + 10; // 10-90% width
        const startY = Math.random() * 10 + 85; // 85-95% height
        
        this.element.style.left = `${startX}vw`;
        this.element.style.top = `${startY}vh`;
        
        // Very slight rotation
        const rotation = Math.random() * 4 - 2; // -2 to 2 degrees
        
        // Long duration for very smooth animation
        const duration = Math.random() * (25 - 18) + 18; // 18-25 seconds
        
        // Simplified animation with CSS
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s ease-out forwards`;
        this.element.style.transform = `rotate(${rotation}deg)`;
    }
}

// Create and manage floating texts
const createFloatingTexts = () => {
    // First clean up any existing text
    document.querySelectorAll('.floating-text').forEach(el => el.remove());
    
    const texts = [];
    // Reduced number of texts
    const numTexts = 3;
    
    for (let i = 0; i < numTexts; i++) {
        const text = new FloatingText();
        texts.push(text);
        
        // Store reference for cleanup
        text.element.__instance = text;
        
        // Restart animation when it ends
        text.element.addEventListener('animationend', () => {
            setTimeout(() => {
                text.startAnimation();
            }, Math.random() * 3000); // 0-3 second delay
        });

        // Staggered start
        setTimeout(() => {
            text.startAnimation();
        }, i * 2000); // 2 second between each
    }
    
    return texts;
};

// Start animations when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // If it's the index page, force disable scrolling
    if (document.body.classList.contains('index-page')) {
        // Force viewport height to window height
        document.documentElement.style.height = '100%';
        document.body.style.height = '100%';
        
        // Prevent any scrolling behavior
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        
        // Add event listener to prevent scrolling
        document.addEventListener('wheel', preventScroll, { passive: false });
        document.addEventListener('touchmove', preventScroll, { passive: false });
    }
    
    // Start floating texts after a short delay
    setTimeout(createFloatingTexts, 1000);
    
    // Cleanup when leaving page
    window.addEventListener('beforeunload', () => {
        document.querySelectorAll('.floating-text').forEach(element => {
            element.remove();
        });
    });
});

// Function to prevent scrolling
function preventScroll(e) {
    if (document.body.classList.contains('index-page')) {
        e.preventDefault();
    }
}
