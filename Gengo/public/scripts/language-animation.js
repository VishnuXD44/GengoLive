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
        document.body.insertBefore(this.element, document.body.firstChild);
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
        
        // Get video container position to avoid overlapping
        const videoContainer = document.querySelector('.video-container');
        let videoContainerRect = null;
        if (videoContainer) {
            videoContainerRect = videoContainer.getBoundingClientRect();
        }
        
        // Random starting position (both X and Y), keeping within viewport bounds
        let startX, startY;
        
        do {
            // Adjust the range to keep text fully within viewport (5-90% instead of 5-95%)
            startX = Math.random() * 85 + 5; // 5% to 90% of viewport width
            // Start from more of the middle of the screen (20-70% of viewport height)
            startY = Math.random() * 50 + 20; // 20% to 70% of viewport height
            
            // Convert to pixels for comparison
            const pixelX = (startX * window.innerWidth) / 100;
            const pixelY = (startY * window.innerHeight) / 100;
            
            // Check if position overlaps with video container
            if (!videoContainerRect || 
                !(pixelX >= videoContainerRect.left && 
                  pixelX <= videoContainerRect.right && 
                  pixelY >= videoContainerRect.top && 
                  pixelY <= videoContainerRect.bottom)) {
                break; // Valid position found
            }
        } while (true);
        
        this.element.style.left = `${startX}vw`;
        this.element.style.top = `${startY}vh`;
        
        // Random rotation between -15 and 15 degrees
        const rotation = Math.random() * 30 - 15;
        this.element.style.transform = `rotate(${rotation}deg)`;
        
        // Random duration between 5-10 seconds
        const duration = Math.random() * (10 - 5) + 5;
        
        // Reset animation
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s ease-in-out`;
    }
}

// Create and manage floating texts
const createFloatingTexts = () => {
    const texts = [];
    // Reduce number of texts to minimize potential impact on performance
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
            text.startAnimation();
        });

        // Stagger the start times
        setTimeout(() => {
            text.startAnimation();
        }, i * 700); // 700ms delay between each text's first appearance
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
