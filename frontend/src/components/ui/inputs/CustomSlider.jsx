import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { soundHandler } from '../../../handlers/SoundHandler';

export default function CustomSlider({ min, max, step, value, onChange, onFinalChange, accentColor = 'primary' }) {
    const activeColorHex =
        accentColor === 'primary' ? 'var(--primary)' :
            accentColor === 'emerald' ? '#10b981' :
                accentColor === 'orange' ? '#f97316' :
                    accentColor === 'red' ? '#ef4444' : 'var(--primary)';

    const [localValue, setLocalValue] = useState(value);
    const throttleTimer = useRef(null);
    const latestVal = useRef(value);
    const isDragging = useRef(false);

    // Sync from props when parent changes value externally,
    // ONLY if the user is not actively dragging the slider (prevents rubber-banding)
    useEffect(() => {
        if (!isDragging.current) {
            setLocalValue(value);
            latestVal.current = value;
        }
    }, [value]);

    const percentage = ((localValue - min) / (max - min)) * 100;
    const isStepped = step >= 1;

    const handlePointerDown = () => {
        isDragging.current = true;
        soundHandler.playClick();
    };

    const handleValueChange = (e) => {
        let val = Number(e.target.value);
        
        // Fix annoying floating point precision errors (e.g. 0.300000004 -> 0.3)
        // by rounding exactly to the step's decimal places
        const stepDecimals = step.toString().split('.')[1]?.length || 0;
        val = Number(val.toFixed(stepDecimals));

        if (isStepped && Math.floor(val) !== Math.floor(localValue)) {
            soundHandler.playSliderTick();
        }
        
        setLocalValue(val);
        latestVal.current = val;

        // Throttle the parent onChange hook to prevent massive lag
        if (onChange) {
            if (!throttleTimer.current) {
                throttleTimer.current = setTimeout(() => {
                    if (isDragging.current) {
                        onChange(latestVal.current);
                    }
                    throttleTimer.current = null;
                }, 50); // 20 frames per second is plenty for the text display
            }
        }
    };

    const handlePointerUp = () => {
        isDragging.current = false;
        
        // Force the final precise value on release
        if (throttleTimer.current) {
            clearTimeout(throttleTimer.current);
            throttleTimer.current = null;
        }
        
        if (onChange) {
            onChange(latestVal.current);
        }
        
        if (onFinalChange) {
            onFinalChange(latestVal.current);
        }
    };

    return (
        <div className="relative w-full py-4 flex items-center group touch-none cursor-pointer">
            {/* Background Track */}
            <div className="absolute w-full h-[6px] bg-[var(--bg)] border border-[var(--border)] rounded-full overflow-hidden shrink-0">
                {/* Fill Track */}
                <div
                    className="h-full relative rounded-full transition-all duration-75 ease-linear shrink-0"
                    style={{
                        width: `${percentage}%`,
                        backgroundColor: activeColorHex,
                        boxShadow: `0 0 8px ${activeColorHex}40`
                    }}
                />
            </div>

            {/* Range Input (Invisible overlay for native interaction) */}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={localValue}
                onChange={handleValueChange}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onTouchEnd={handlePointerUp}
                className="absolute w-full h-full opacity-0 cursor-pointer z-10 m-0 p-0"
            />

            {/* Custom Thumb */}
            <motion.div
                className="absolute w-5 h-5 rounded-full pointer-events-none z-0 shadow-lg border-2 border-[var(--surface)]"
                style={{
                    left: `calc(${percentage}% - 10px)`,
                    backgroundColor: activeColorHex,
                    boxShadow: `0 0 12px ${activeColorHex}80`,
                }}
                whileHover={{ scale: 1.25 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
            />
        </div>
    );
}
