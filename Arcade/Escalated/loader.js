import * as THREE from 'three';
import { preloadAllAssets } from './preloadAssets.js';

const loader = {
    canvas: null,
    ctx: null,
    matrixFontSize: 16,
    matrixChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789=-.:#@アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン',
    streams: [],
    angle: 0, // Will be calculated dynamically
    escalatorFontSize: 0,
    animationProgress: 0,
    animationSpeed: 0.03, // 0.015,
    minCycles: 1,
    word: " ESCALATED ",
    escalatorChars: [],
    numSteps: 0,
    escalatorFont: "'Ultra', sans-serif",
    animationFrameId: null,
    escalatorAnimationDone: false,
    mayhemAlpha: 0,
    continueMessage: null,
    readyToContinue: false,
    
    backgroundImage: null, // To hold the image object
    backgroundPattern: null, // To hold the canvas pattern

    mafiaImage: null,
    mafiaImageLoaded: false,
    mafiaImageX: 0,
    scaledMafiaWidth: null,

    sonnyImage: null,
    sonnyImageLoaded: false,
    sonnyImageX: 0,
    scaledSonnyWidth: null,


    start() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'loaderCanvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '1001';
        this.canvas.style.backgroundColor = '#000';
        document.body.appendChild(this.canvas);

        // Load the EM_Mafia image for the loading indicator
        this.mafiaImage = new Image();
        this.mafiaImage.onload = () => {
            console.log('Mafia image loaded.');
            this.mafiaImageLoaded = true;
            // Start position based on image width, fully off-screen to the left
            this.mafiaImageX = -this.mafiaImage.width; 
        };
        this.mafiaImage.onerror = () => {
            console.error('Failed to load mafia image.');
            this.mafiaImageLoaded = false;
        };
        this.mafiaImage.src = './textures/EM_Mafia.png';

        // Load the Sonny image
        this.sonnyImage = new Image();
        this.sonnyImage.onload = () => {
            console.log('Sonny image loaded.');
            this.sonnyImageLoaded = true;
            this.sonnyImageX = window.innerWidth; 
        };
        this.sonnyImage.onerror = () => {
            console.error('Failed to load sonny image.');
            this.sonnyImageLoaded = false;
        };
        this.sonnyImage.src = './textures/EM_Sonny_Otto.png';

                // Load the background image
        this.backgroundImage = new Image();
        this.backgroundImage.onload = () => {
            console.log('Loader background image loaded.');
            // Once loaded, setup the canvas and pattern.
            this.setupCanvas(); 
        };
        this.backgroundImage.onerror = () => {
            console.error('Failed to load loader background image. Falling back to black.');
            this.backgroundImage = null; // Ensure we don't try to use it
        };
        // NOTE: The path to your image. Adjust if 'Mafia2.png' is located elsewhere.
        this.backgroundImage.src = './textures/Escalated_Mayhem.png'; // EM_Background.png';


        this.ctx = this.canvas.getContext('2d');
        this.escalatorChars = [...this.word.split(''), '•'];
        this.numSteps = this.escalatorChars.length;

        // Add CSS for the blinking cursor
        const style = document.createElement('style');
        style.id = 'loader-style';
        style.innerHTML = `
            .blinking-cursor {
                font-weight: bold;
                animation: blink 1s step-start 0s infinite;
            }
            @keyframes blink {
                50% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        // Add "Press any Key" message element
        this.continueMessage = document.createElement('div');
        this.continueMessage.id = 'continueMessage';
        this.continueMessage.style.position = 'fixed';
        this.continueMessage.style.top = '20px';
        this.continueMessage.style.left = '20px';
        this.continueMessage.style.fontFamily = "'Courier New', Courier, monospace";
        this.continueMessage.style.fontWeight = 'bold';
        this.continueMessage.style.color = 'cyan';
        this.continueMessage.style.fontSize = '26px';
        this.continueMessage.style.textShadow = '1px 1px 2px #002244';
        this.continueMessage.style.display = 'block'; // Initially visible
        this.continueMessage.style.zIndex = '1002'; // Ensure it's on top of the canvas
        this.continueMessage.innerHTML = 'Loading... <span class="blinking-cursor">_</span>';
        document.body.appendChild(this.continueMessage);

        this.setupCanvas();
        window.addEventListener('resize', this.setupCanvas.bind(this));

        this.animate();

        // Create a dummy scene and renderer for preloading
        const preloadScene = new THREE.Scene();
        const preloadRenderer = new THREE.WebGLRenderer();
        preloadRenderer.setSize(1, 1); // off-screen
        preloadAllAssets(preloadScene, preloadRenderer);


        const gameLoadedPromise = this.loadGameScripts();
        const animationDonePromise = new Promise(resolve => {
            const checkAnimation = () => {
                const currentCycles = this.animationProgress / this.numSteps;
                if (currentCycles >= this.minCycles) {
                    resolve();
                } else {
                    requestAnimationFrame(checkAnimation);
                }
            };
            checkAnimation();
        });

        Promise.all([gameLoadedPromise, animationDonePromise]).then(() => {
            this.escalatorAnimationDone = true; // Show "Mayhem" text
            this.readyToContinue = true;
            this.continueMessage.innerHTML = 'Press any Key to Continue <span class="blinking-cursor">_</span>';

            const onContinue = () => {
                this.stop();
                document.removeEventListener('keydown', onContinue);
                document.removeEventListener('click', onContinue);
            };

            document.addEventListener('keydown', onContinue);
            document.addEventListener('click', onContinue);
        });
    },

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.canvas) {
            this.canvas.style.transition = 'opacity 1s ease-out';
            this.canvas.style.opacity = '0';
            setTimeout(() => {
                this.canvas.remove();
            }, 1000);
        }
        if (this.continueMessage) {
            this.continueMessage.remove();
        }
        const styleElement = document.getElementById('loader-style');
        if (styleElement) {
            styleElement.remove();
        }
    },

    loadGameScripts() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'module';
            script.src = './main.js';
            script.onload = () => {
                console.log('Game scripts loaded.');
                resolve();
            };
            script.onerror = (e) => {
                console.error('Failed to load game scripts.', e);
                reject(e);
            };
            document.body.appendChild(script);
        });
    },

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.angle = Math.atan2(-this.canvas.height, this.canvas.width);
        this.escalatorFontSize = Math.min(this.canvas.width, this.canvas.height) * 0.09;

        
        // Create/recreate the background pattern if the image is loaded
        if (this.backgroundImage && this.backgroundImage.complete && this.backgroundImage.naturalWidth > 0) {
            // To make the pattern cover the whole canvas, we draw the scaled image
            // to a temporary canvas and create the pattern from that. This handles resizing.
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = this.canvas.width;
            tempCanvas.height = this.canvas.height;
            tempCtx.drawImage(this.backgroundImage, 0, 0, tempCanvas.width, tempCanvas.height);
            this.backgroundPattern = this.ctx.createPattern(tempCanvas, 'no-repeat');
        } else {
            this.backgroundPattern = null;
        }

        this.initializeStreams();
    },

    initializeStreams() {
        this.streams.length = 0;
        const streamCount = Math.floor((this.canvas.width + this.canvas.height) / 30);
        for (let i = 0; i < streamCount; i++) {
            this.streams.push(new Stream(this));
        }
    },

    drawEscalatorText() {
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const textBlockWidth = this.canvas.width * 0.7;
        const textBlockHeight = this.canvas.height * 0.7;
        const startX = (this.canvas.width - textBlockWidth) / 2;
        const startY = this.canvas.height - (this.canvas.height - textBlockHeight) / 2;
        const stepX = textBlockWidth / (this.numSteps - 1);
        const stepY = textBlockHeight / (this.numSteps - 1);

        for (let i = 0; i < this.numSteps; i++) {
            const char = this.escalatorChars[i];

            if (this.escalatorAnimationDone && char === '•') {
                continue;
            }

            const rawPosition = i + this.animationProgress;
            const wrappedPosition = ((rawPosition % this.numSteps) + this.numSteps) % this.numSteps;

            const x = startX + wrappedPosition * stepX;
            const y = startY - wrappedPosition * stepY;

            let alpha = 1.0;
            const fadeZone = 1.5;
            if (wrappedPosition > this.numSteps - fadeZone) {
                alpha = (this.numSteps - wrappedPosition) / fadeZone;
            } else if (wrappedPosition < fadeZone - 1) {
                alpha = (wrappedPosition + 1) / fadeZone;
            }
            alpha = Math.max(0, Math.min(1, alpha));

            this.ctx.save();
            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;

            if (i === 1) { // First 'E' is at index 1
                this.ctx.font = `bold ${this.escalatorFontSize * 1.5}px ${this.escalatorFont}`;
            } else {
                this.ctx.font = `bold ${this.escalatorFontSize}px ${this.escalatorFont}`;
            }

            if (this.readyToContinue) {
                const tealGradient = ['#00FFFF', '#00E0FE', '#00C2DF', '#00A3BF', '#00859F', '#00667F', '#00445F', '#00334F', '#00243F'];
                if (i > 0 && i < 11 && this.escalatorChars[i] !== ' ') {
                    const letterIndex = i - 1;
                    this.ctx.shadowColor = tealGradient[letterIndex];
                } else {
                    this.ctx.shadowColor = 'transparent';
                }
                this.ctx.shadowBlur = 20;
                this.ctx.translate(x, y);
                this.ctx.scale(1.5, 1);
                this.ctx.fillText(char, 0, 0);
            } else {
                if (i === 1) { // First 'E'
                    this.ctx.shadowColor = 'cyan';
                    this.ctx.shadowBlur = 15;
                } else {
                    this.ctx.shadowColor = '#00445F', //'black';
                    this.ctx.shadowBlur = 15;
                }
                this.ctx.fillText(char, x, y);
            }
            
            this.ctx.restore();
        }

        if (!this.escalatorAnimationDone) {
            this.animationProgress += this.animationSpeed;
        }
    },

    drawMafiaImage() {
        if (!this.mafiaImageLoaded) return;

        const img = this.mafiaImage;
        let drawHeight = img.height;
        let drawWidth = img.width;
        
        // Scale image if its height is greater than the canvas height
        if (img.height > this.canvas.height) {
            drawHeight = this.canvas.height;
            const aspectRatio = img.width / img.height;
            drawWidth = drawHeight * aspectRatio;
        }

        // On the first frame this is called, adjust the initial X position to match the scaled width.
        if (this.scaledMafiaWidth === null) {
            this.mafiaImageX = -drawWidth;
        }
        this.scaledMafiaWidth = drawWidth;


        // Calculate progress of the "ESCALATED" text animation to sync the slide-in
        let progress = this.animationProgress / (this.numSteps * this.minCycles);
        progress = Math.min(1, progress); // Clamp progress to 1

        // When loading is fully complete, ensure the image is at its final destination
        if (this.readyToContinue) {
            progress = 1;
        }

        // The target X position goes from -drawWidth (off-screen) to 0 (left edge aligned).
        const targetX = (progress - 1) * this.scaledMafiaWidth;

        // Interpolate for smooth movement.
        this.mafiaImageX += (targetX - this.mafiaImageX) * 0.05;

        // Draw the image at the bottom of the screen, scaled.
        this.ctx.drawImage(img, this.mafiaImageX, this.canvas.height - drawHeight, this.scaledMafiaWidth, drawHeight);
    },

    drawMayhem() {
        if (!this.escalatorAnimationDone) return;

        if (this.mayhemAlpha < 1) {
            this.mayhemAlpha += 0.01;
        }

        this.ctx.font = `italic bold ${this.canvas.width / 12}px 'Yellowtail'`;
        
        if (this.readyToContinue) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.mayhemAlpha})`; // White
        } else {
            this.ctx.fillStyle = `rgba(255, 100, 0, ${this.mayhemAlpha})`; // Orange
        }

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const x = this.canvas.width * (2 / 3);
        const y = this.canvas.height * (2 / 3);

        this.ctx.save();
        this.ctx.shadowColor = '#FF2200'; // Orange
        this.ctx.shadowBlur = 20;
        this.ctx.fillText("Mayhem", x, y);
        this.ctx.restore();
    },

    drawSonnyImage() {
        if (!this.sonnyImageLoaded) return;

        // --- Scaling Logic ---
        const img = this.sonnyImage;
        let drawHeight = img.height;
        let drawWidth = img.width;
        
        if (img.height > this.canvas.height) {
            drawHeight = this.canvas.height;
            const aspectRatio = img.width / img.height;
            drawWidth = drawHeight * aspectRatio;
        }

        if (this.scaledSonnyWidth === null) {
            this.sonnyImageX = this.canvas.width; // Start off-screen right
        }
        this.scaledSonnyWidth = drawWidth;

        // --- Progress Calculation ---
        const overallProgress = Math.min(1, this.animationProgress / (this.numSteps * this.minCycles));
        let sonnyProgress = 0;
        if (overallProgress >= 0.5) {
            sonnyProgress = (overallProgress - 0.5) * 2;
        }
        sonnyProgress = Math.min(1, sonnyProgress);

        if (this.readyToContinue) {
            sonnyProgress = 1;
        }

        // --- Position Calculation ---
        const startX = this.canvas.width;
        const endX = this.canvas.width - this.scaledSonnyWidth;
        const targetX = startX + (endX - startX) * sonnyProgress;

        this.sonnyImageX += (targetX - this.sonnyImageX) * 0.05;

        this.ctx.drawImage(img, this.sonnyImageX, this.canvas.height - drawHeight, this.scaledSonnyWidth, drawHeight);
    },

    animate() {
        this.drawMafiaImage();
        this.drawSonnyImage();

        /* this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); */

        // This is the replacement for the original fillRect logic.
        // Instead of a semi-transparent black, we use a semi-transparent
        // pattern created from the background image. This will cause the
        // Matrix rain to fade into the image, creating a very cool effect.
        if (this.backgroundPattern) {
            this.ctx.globalAlpha = 0.1; // This controls the fade speed
            this.ctx.fillStyle = this.backgroundPattern;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1.0; // Reset alpha for other drawings
        } else {
            // Fallback to the original effect if the image isn't loaded or failed
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';  
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.streams.forEach(stream => {
            stream.draw();
            stream.update();
        });

        this.drawEscalatorText();
        this.drawMayhem();

        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    }
};

class Stream {
    constructor(loader) {
        this.loader = loader;
        this.speed = (Math.random() * 4) + 1;
        this.length = Math.floor(Math.random() * 20) + 15;
        this.characters = [];
        this.direction = Math.random() < 0.5 ? 1 : -1; // For crossfire effect
        this.generateCharacters();
        this.resetPosition();
    }

    resetPosition() {
        const canvas = this.loader.canvas;
        const matrixFontSize = this.loader.matrixFontSize;
        if (this.direction === 1) { // Moves parallel (bottom-left to top-right)
            if (Math.random() > 0.5) {
                this.x = Math.random() * canvas.width;
                this.y = canvas.height + this.length * matrixFontSize;
            } else {
                this.x = -this.length * matrixFontSize;
                this.y = Math.random() * canvas.height;
            }
        } else { // Moves opposite (top-right to bottom-left)
            if (Math.random() > 0.5) {
                this.x = Math.random() * canvas.width;
                this.y = -this.length * matrixFontSize;
            } else {
                this.x = canvas.width + this.length * matrixFontSize;
                this.y = Math.random() * canvas.height;
            }
        }
    }

    generateCharacters() {
        this.characters = [];
        for (let i = 1; i < this.length; i++) {
            this.characters.push({ value: '', isLeader: false });
        }
        this.characters.push({ value: 'D', isLeader: true }); // Leader character
    }

    draw() {
        const ctx = this.loader.ctx;
        const matrixFontSize = this.loader.matrixFontSize;
        const matrixChars = this.loader.matrixChars;

        ctx.save();
        ctx.translate(this.x, this.y);
        // Rotate to make streams parallel to the Escalated text movement.
        const rotation = this.direction === 1 ? this.loader.angle : this.loader.angle + Math.PI;
        ctx.rotate(rotation);

        for (let i = 0; i < this.characters.length; i++) {
            const charInfo = this.characters[i];
            const charX = i * (matrixFontSize - 4);

            if (charInfo.isLeader) {
                ctx.font = `bold ${matrixFontSize + 4}px 'Oi'`;
                ctx.shadowColor = '#00ffff';
                ctx.shadowBlur = 5;
                ctx.fillStyle = '#77FFFF';
                ctx.fillText(charInfo.value, charX, 0);
            } else {
                ctx.font = `${matrixFontSize}px monospace`;
                ctx.shadowBlur = 5;
                ctx.shadowColor = '#00AAAA';
                ctx.fillStyle = '#00AAAA';
                const randomChar = matrixChars.charAt(Math.floor(Math.random() * matrixChars.length));
                ctx.fillText(randomChar, charX, 0);
            }
        }
        ctx.restore();
        ctx.shadowBlur = 0;
    }

    update() {
        const angle = this.loader.angle;
        this.x += this.speed * Math.cos(angle) * this.direction;
        this.y += this.speed * Math.sin(angle) * this.direction;

        const canvas = this.loader.canvas;
        const offScreen = (this.direction === 1 && (this.y < -50 || this.x < -50)) ||
                          (this.direction === -1 && (this.y > canvas.height + 50 || this.x > canvas.width + 50));

        if (offScreen) {
            // If main animation is done, don't reset the stream. Let it die.
            if (this.loader.escalatorAnimationDone && this.loader.readyToContinue) return;
            this.resetPosition();
        }
    }
}

// Automatically start the loader
loader.start();
