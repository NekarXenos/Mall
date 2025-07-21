const loader = {
    canvas: null,
    ctx: null,
    matrixFontSize: 16,
    matrixChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789=-.:#@アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン',
    streams: [],
    angle: -Math.PI / 4,
    escalatorFontSize: 0,
    animationProgress: 0,
    animationSpeed: 0.015,
    minCycles: 1,
    word: "ESCALATED",
    escalatorChars: [],
    numSteps: 0,
    escalatorFont: "'Ultra', sans-serif",
    animationFrameId: null,
    escalatorAnimationDone: false,
    mayhemAlpha: 0,
    continueMessage: null,
    readyToContinue: false,

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
        this.continueMessage.style.color = 'cyan';
        this.continueMessage.style.fontSize = '24px';
        this.continueMessage.style.textShadow = '1px 1px 2px #000000';
        this.continueMessage.style.display = 'none'; // Initially hidden
        this.continueMessage.style.zIndex = '1002'; // Ensure it's on top of the canvas
        this.continueMessage.innerHTML = 'Press any Key to Continue <span class="blinking-cursor">_</span>';
        document.body.appendChild(this.continueMessage);

        this.setupCanvas();
        window.addEventListener('resize', this.setupCanvas.bind(this));

        this.animate();

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
            this.continueMessage.style.display = 'block';

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
        this.escalatorFontSize = Math.min(this.canvas.width, this.canvas.height) * 0.09;
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
        this.ctx.font = `bold ${this.escalatorFontSize}px ${this.escalatorFont}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const pathLength = Math.min(this.canvas.width, this.canvas.height) * 0.8;
        const startX = (this.canvas.width - pathLength) / 2;
        const startY = (this.canvas.height + pathLength) / 2;
        const stepX = pathLength / (this.numSteps - 1);
        const stepY = pathLength / (this.numSteps - 1);

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
            this.ctx.shadowColor = 'orangered';
            this.ctx.shadowBlur = 15;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;

            if (this.readyToContinue) {
                this.ctx.translate(x, y);
                this.ctx.scale(1.5, 1);
                this.ctx.fillText(char, 0, 0);
            } else {
                this.ctx.fillText(char, x, y);
            }
            
            this.ctx.restore();
        }

        if (!this.escalatorAnimationDone) {
            this.animationProgress += this.animationSpeed;
        }
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
        this.ctx.shadowColor = 'red';
        this.ctx.shadowBlur = 20;
        this.ctx.fillText("Mayhem", x, y);
        this.ctx.restore();
    },

    animate() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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
                ctx.fillStyle = '#CCCCCC';
                ctx.fillText(charInfo.value, charX, 0);
            } else {
                ctx.font = `${matrixFontSize}px monospace`;
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#008888';
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