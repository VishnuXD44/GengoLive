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
        
        // Random size between 1rem and 2.5rem
        const size = Math.random() * (2.5 - 1) + 1;
        this.element.style.fontSize = `${size}rem`;
        
        // Random starting position
        const startX = Math.random() * 80 + 10; // 10% to 90% of viewport width
        const startY = Math.random() * 20 + 90; // 90% to 110% of viewport height
        this.element.style.left = `${startX}vw`;
        this.element.style.top = `${startY}vh`;
        
        // Random duration between 6-10 seconds for smoother animation
        const duration = Math.random() * (10 - 6) + 6;
        
        // Random delay before starting
        const delay = Math.random() * 2;
        
        // Reset animation with delay
        this.element.style.animation = 'none';
        this.element.offsetHeight; // Trigger reflow
        this.element.style.animation = `float ${duration}s ${delay}s linear`;
        
        // Add random rotation
        const rotation = Math.random() * 20 - 10; // -10 to 10 degrees
        this.element.style.transform = `rotate(${rotation}deg)`;
    }
}

// Create and manage floating texts
const createFloatingTexts = () => {
    const texts = [];
    const numTexts = 10; // Reduced number for better performance
    const baseDelay = 800; // Increased delay between texts

    // Create initial texts
    for (let i = 0; i < numTexts; i++) {
        const text = new FloatingText();
        texts.push(text);
        
        // Restart animation when it ends
        text.element.addEventListener('animationend', () => {
            // Remove old element
            text.element.remove();
            // Create new text
            const newText = new FloatingText();
            texts[texts.indexOf(text)] = newText;
        });

        // Stagger the start times with random variation
        const randomDelay = Math.random() * 500;
        setTimeout(() => {
            text.startAnimation();
        }, i * baseDelay + randomDelay);
    }
};

// Start animations when document is loaded
document.addEventListener('DOMContentLoaded', createFloatingTexts);
