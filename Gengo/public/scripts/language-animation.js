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
        
        // Get video container position to avoid overlapping
        const videoContainer = document.querySelector('.video-container');
        let videoContainerRect = null;
        if (videoContainer) {
            videoContainerRect = videoContainer.getBoundingClientRect();
        }
        
        // Random starting position (both X and Y)
        let startX, startY;
        
        do {
            startX = Math.random() * 90 + 5; // 5% to 95% of viewport width
            startY = Math.random() * 20 + 80; // 80% to 100% of viewport height
            
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
    const numTexts = 12; // Number of floating texts

    for (let i = 0; i < numTexts; i++) {
        const text = new FloatingText();
        texts.push(text);
        
        // Restart animation when it ends
        text.element.addEventListener('animationend', () => {
            text.startAnimation();
        });

        // Stagger the start times
        setTimeout(() => {
            text.startAnimation();
        }, i * 700); // 700ms delay between each text's first appearance
    }
};

// Start animations when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit before starting animations to ensure all elements are loaded
    setTimeout(createFloatingTexts, 1000);
    
    // Add window resize handler to reposition text if needed
    window.addEventListener('resize', () => {
        document.querySelectorAll('.floating-text').forEach(text => {
            const instance = text.__instance;
            if (instance) instance.startAnimation();
        });
    });
});
