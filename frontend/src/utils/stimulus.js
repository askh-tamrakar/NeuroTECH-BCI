/**
 * High-performance flicker utility for BCI stimuli.
 * Uses performance.now() and requestAnimationFrame for precise timing.
**/

export class FlickerStimulus {
    constructor(frequency, onToggle) {
        this.frequency = frequency;
        this.onToggle = onToggle;
        this.isRunning = false;
        this.animationFrame = null;
        this.lastToggleTime = 0;
        this.halfPeriod = 0;
        this.isOn = false;

        this.updateFrequency(frequency);
    }

    updateFrequency(frequency) {
        this.frequency = frequency;
        if (frequency > 0) {
            this.halfPeriod = 1000 / (frequency * 2);
        } else {
            this.halfPeriod = 0;
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastToggleTime = performance.now();
        this.isOn = false;
        this.loop(this.lastToggleTime);
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    loop(timestamp) {
        if (!this.isRunning) return;

        if (this.halfPeriod > 0) {
            const elapsed = timestamp - this.lastToggleTime;
            if (elapsed >= this.halfPeriod) {
                // Determine how many half-periods have passed to stay in sync
                const toggles = Math.floor(elapsed / this.halfPeriod);
                if (toggles % 2 === 1) {
                    this.isOn = !this.isOn;
                    this.onToggle(this.isOn);
                }
                // Update lastToggleTime by the exact multiples of halfPeriod
                this.lastToggleTime += toggles * this.halfPeriod;
            }
        }

        this.animationFrame = requestAnimationFrame((t) => this.loop(t));
    }
}
