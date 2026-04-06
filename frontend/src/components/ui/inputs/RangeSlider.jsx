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
    labelPrefix = '',
    labelSuffix = '',
    leftColor,
    middleColor,
    rightColor,
    hideLabels = false,
    className = '',
    compact = false,
    leftPointerColor,
    rightPointerColor
}) => {
    const trackRef = useRef(null);
    const containerRef = useRef(null);
    const [activeHandle, setActiveHandle] = useState(null); // 'min' or 'max'

    // Compute left/middle/right for output
    const left = minValue - min;
    const middle = maxValue - minValue;
    const right = max - maxValue;

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
        if (!activeHandle) return;
        e.stopPropagation();

        const newValue = getValueFromPosition(e.clientX);

        if (activeHandle === 'min') {
            const minGap = Math.max(step, 2); // 2 units minimum distance
            const effectiveValue = Math.min(newValue, maxValue - minGap);
            if (effectiveValue !== minValue) {
                onChange({
                    min: effectiveValue,
                    max: maxValue,
                    left: effectiveValue - min,
                    middle: maxValue - effectiveValue,
                    right: max - maxValue
                });
            }
        } else {
            const minGap = Math.max(step, 2);
            const effectiveValue = Math.max(newValue, minValue + minGap);
            if (effectiveValue !== maxValue) {
                onChange({
                    min: minValue,
                    max: effectiveValue,
                    left: minValue - min,
                    middle: effectiveValue - minValue,
                    right: max - effectiveValue
                });
            }
        }
    };

    const handlePointerUp = (e) => {
        if (!activeHandle) return;
        e.stopPropagation();
        if (containerRef.current) {
            containerRef.current.releasePointerCapture(e.pointerId);
        }
        if (onFinalChange) {
            onFinalChange({
                min: minValue,
                max: maxValue,
                left,
                middle,
                right
            });
        }
        setActiveHandle(null);
    };

    const minPos = getPercentage(minValue);
    const maxPos = getPercentage(maxValue);

    // Default colors for pointers if not specified
    const finalLeftPointerColor = leftPointerColor || color;
    const finalRightPointerColor = rightPointerColor || color;

    return (
        <div
            ref={containerRef}
            className={`range-slider-container w-full ${compact ? 'px-1 pt-2 pb-2' : 'px-4 pt-10 pb-4'} select-none touch-none ${className}`}
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
                {/* Secondary 'light' fill for the entire track - only if no segments provided */}
                {(!leftColor && !middleColor && !rightColor) && (
                    <div
                        className="absolute inset-0 rounded-full opacity-20"
                        style={{ backgroundColor: color }}
                    />
                )}

                {/* Optional 3-segment Active Highlights */}
                {leftColor && (
                    <div
                        className="absolute h-full rounded-full pointer-events-none"
                        style={{
                            left: '0%',
                            width: `${minPos}%`,
                            backgroundColor: leftColor,
                            boxShadow: `0 0 10px ${leftColor}60`
                        }}
                    />
                )}
                {/* Middle 'Active Range' Highlight - Exactly between handles */}
                <div
                    className="absolute h-full rounded-full pointer-events-none"
                    style={{
                        left: `${minPos}%`,
                        right: `${Math.max(0, 100 - maxPos)}%`,
                        backgroundColor: middleColor || color,
                        boxShadow: `0 0 10px ${(middleColor || color)}60`
                    }}
                />

                {rightColor && (
                    <div
                        className="absolute h-full rounded-full pointer-events-none"
                        style={{
                            left: `${maxPos}%`,
                            width: `${Math.max(0, 100 - maxPos)}%`,
                            backgroundColor: rightColor,
                            boxShadow: `0 0 10px ${rightColor}60`
                        }}
                    />
                )}

                <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform hover:scale-110 z-30 flex items-center justify-center"
                    style={{ left: `${minPos}%`, borderColor: finalLeftPointerColor }}
                    onPointerDown={(e) => startDragging(e, 'min')}
                >
                    {/* Tooltip Label */}
                    {!hideLabels && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-lighter px-2 py-1 rounded-md text-[11px] font-black text-text border border-border/60 whitespace-nowrap shadow-xl pointer-events-none z-50">
                            {labelPrefix}{Number(minValue.toFixed(step.toString().includes('.') ? step.toString().split('.')[1].length : 0))}{labelSuffix}
                        </div>
                    )}
                    {/* Inner dot for handle */}
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: finalLeftPointerColor, opacity: 0.5 }} />
                </div>

                <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform hover:scale-110 z-30 flex items-center justify-center"
                    style={{ left: `${maxPos}%`, borderColor: finalRightPointerColor }}
                    onPointerDown={(e) => startDragging(e, 'max')}
                >
                    {/* Tooltip Label */}
                    {!hideLabels && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-lighter px-2 py-1 rounded-md text-[11px] font-black text-text border border-border/60 whitespace-nowrap shadow-xl pointer-events-none z-50">
                            {labelPrefix}{Number(maxValue.toFixed(step.toString().includes('.') ? step.toString().split('.')[1].length : 0))}{labelSuffix}
                        </div>
                    )}
                    {/* Inner dot for handle */}
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: finalRightPointerColor, opacity: 0.5 }} />
                </div>
            </div>
        </div>
    );
};

export default RangeSlider;