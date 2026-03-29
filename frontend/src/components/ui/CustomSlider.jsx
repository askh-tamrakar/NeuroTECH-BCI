import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { soundHandler } from '../../handlers/SoundHandler';

export default function CustomSlider({ min, max, step, value, onChange, onFinalChange, accentColor = 'primary' }) {
    const activeColorHex = 
        accentColor === 'primary' ? 'var(--primary)' : 
        accentColor === 'emerald' ? '#10b981' : 
        accentColor === 'orange' ? '#f97316' : 
        accentColor === 'red' ? '#ef4444' : 'var(--primary)';

    const [localValue, setLocalValue] = useState(value);

    // Sync from props when parent changes value externally
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const percentage = ((localValue - min) / (max - min)) * 100;
    const isStepped = step >= 1;

    const handlePointerDown = () => {
        soundHandler.playClick();
    };

    const handleValueChange = (e) => {
        const val = Number(e.target.value);
        if (isStepped && Math.floor(val) !== Math.floor(localValue)) {
            soundHandler.playSliderTick();
        }
        setLocalValue(val);
        if (onChange) {
            onChange(val);
        }
    };

    const handlePointerUp = () => {
        if (onFinalChange) {
            onFinalChange(localValue);
        }
    };

    return (
        <div className="relative w-full py-3 flex items-center group touch-none">
            {/* Background Track */}
            <div className="absolute w-full h-[6px] bg-bg rounded-full overflow-hidden shrink-0">
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
                className="absolute w-5 h-5 rounded-full pointer-events-none z-0 shadow-lg border-2 border-surface"
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
