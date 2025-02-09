
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
        
        // Random size between 0.8rem and 2rem
        const size = Math.random() * (2 - 0.8) + 0.8;
        this.element.style.fontSize = `${size}rem`;
        
        // Random starting position (both X and Y)
        const startX = Math.random() * 90 + 5; // 5% to 95% of viewport width
        const startY = Math.random() * 20 + 90; // 90% to 110% of viewport height
        this.element.style.left = `${startX}vw`;
        this.element.style.top = `${startY}vh`;
        
        // Random duration between 4-8 seconds
        const duration = Math.random() * (8 - 4) + 4;
        
        // Reset animation
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s linear`;
    }
}

// Create and manage floating texts
const createFloatingTexts = () => {
    const texts = [];
    const numTexts = 15; // Number of floating texts

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
        }, i * 500); // 500ms delay between each text's first appearance
    }
};

// Start animations when document is loaded
document.addEventListener('DOMContentLoaded', createFloatingTexts);
