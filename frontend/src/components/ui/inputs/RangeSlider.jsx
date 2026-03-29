import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * A sleek, dual-handle range slider with Pointer Capture and event isolation.
 * Specifically prevents interaction conflicts with the FFT Chart's mouse tracking.
 */
const RangeSlider = ({
    min = 0,
    max = 100,
    step = 1,
    minValue,
    maxValue,
    onChange,
    onFinalChange,
    color = '#3b82f6',
    bgColor = '#3b3b3b',
    labelPrefix = '',
    labelSuffix = ''
}) => {
    const trackRef = useRef(null);
    const containerRef = useRef(null);
    const [activeHandle, setActiveHandle] = useState(null); // 'min' or 'max'

    // Clean up handle on global mouse release
    useEffect(() => {
        const handleGlobalUp = () => setActiveHandle(null);
        window.addEventListener('mouseup', handleGlobalUp);
        return () => window.removeEventListener('mouseup', handleGlobalUp);
    }, []);

    const getPercentage = useCallback((value) => {
        return ((value - min) / (max - min)) * 100;
    }, [min, max]);

    const getValueFromPosition = useCallback((clientX) => {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const rawValue = min + percentage * (max - min);
        // Add safety check for divide by zero or NaN
        if (isNaN(rawValue)) return min;

        // Final fix for floating point precision:
        const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
        return Number((Math.round(rawValue / step) * step).toFixed(precision));
    }, [min, max, step]);

    const startDragging = (e, handle) => {
        e.preventDefault();
        e.stopPropagation();
        if (containerRef.current) {
            containerRef.current.setPointerCapture(e.pointerId);
        }
        setActiveHandle(handle);
    };

    const handlePointerMove = (e) => {
        // MUST stop propagation to prevent parent containers (like FFT Chart) 
        // from receiving these move events while we are dragging.
        e.stopPropagation();

        if (!activeHandle || e.buttons !== 1) {
            if (activeHandle) setActiveHandle(null);
            return;
        }

        const newValue = getValueFromPosition(e.clientX);

        if (activeHandle === 'min') {
            const effectiveValue = Math.min(newValue, maxValue - step);
            if (effectiveValue !== minValue) {
                onChange({ min: effectiveValue, max: maxValue });
            }
        } else {
            const effectiveValue = Math.max(newValue, minValue + step);
            if (effectiveValue !== maxValue) {
                onChange({ min: minValue, max: effectiveValue });
            }
        }
    };

    const handlePointerUp = (e) => {
        e.stopPropagation();
        if (activeHandle) {
            if (containerRef.current) {
                containerRef.current.releasePointerCapture(e.pointerId);
            }
            if (onFinalChange) {
                onFinalChange({ min: minValue, max: maxValue });
            }
            setActiveHandle(null);
        }
    };

    const minPos = getPercentage(minValue);
    const maxPos = getPercentage(maxValue);

    return (
        <div
            ref={containerRef}
            className="range-slider-container w-full px-4 pt-10 pb-4 select-none touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            {/* The Track */}
            <div
                ref={trackRef}
                className="relative h-1.5 w-full bg-bg rounded-full cursor-pointer"
                onPointerDown={(e) => {
                    const clickValue = getValueFromPosition(e.clientX);
                    const distMin = Math.abs(clickValue - minValue);
                    const distMax = Math.abs(clickValue - maxValue);
                    const handle = distMin < distMax ? 'min' : 'max';
                    startDragging(e, handle);
                }}
            >
                {/* Secondary 'light' fill for the entire track */}
                <div 
                    className="absolute inset-0 rounded-full opacity-20"
                    style={{ backgroundColor: color }}
                />
                {/* Active Range Highlight - Exactly between handles */}
                <div
                    className="absolute h-full rounded-full pointer-events-none"
                    style={{
                        left: `${minPos}%`,
                        right: `${Math.max(0, 100 - maxPos)}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 10px ${color}60`
                    }}
                />

                {/* Left Handle */}
                <div 
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform hover:scale-110 z-30 flex items-center justify-center"
                    style={{ left: `${minPos}%`, borderColor: color }}
                    onPointerDown={(e) => startDragging(e, 'min')}
                >
                    {/* Tooltip Label */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-lighter px-2 py-1 rounded-md text-[11px] font-black text-text border border-border/60 whitespace-nowrap shadow-xl pointer-events-none z-50">
                        {labelPrefix}{Number(minValue.toFixed(step.toString().includes('.') ? step.toString().split('.')[1].length : 0))}{labelSuffix}
                    </div>
                    {/* Inner dot for handle */}
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
                </div>

                {/* Right Handle */}
                <div 
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform hover:scale-110 z-30 flex items-center justify-center"
                    style={{ left: `${maxPos}%`, borderColor: color }}
                    onPointerDown={(e) => startDragging(e, 'max')}
                >
                    {/* Tooltip Label */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-lighter px-2 py-1 rounded-md text-[11px] font-black text-text border border-border/60 whitespace-nowrap shadow-xl pointer-events-none z-50">
                        {labelPrefix}{Number(maxValue.toFixed(step.toString().includes('.') ? step.toString().split('.')[1].length : 0))}{labelSuffix}
                    </div>
                    {/* Inner dot for handle */}
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
                </div>
            </div>
        </div>
    );
};

export default RangeSlider;
