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
    labelSuffix = '',
    labelPrefix = '',
    leftColor,
    middleColor,
    rightColor,
    hideLabels = false,
    className = '',
    compact = false,
    minLimit,
    maxLimit
}) => {
    const trackRef = useRef(null);
    const containerRef = useRef(null);
    const [activeHandle, setActiveHandle] = useState(null); // 'min' or 'max'

    // Global interactions cleanup
    useEffect(() => {
        const handleGlobalUp = (e) => {
            if (activeHandle) {
                if (containerRef.current && e.pointerId !== undefined) {
                    try {
                        containerRef.current.releasePointerCapture(e.pointerId);
                    } catch (err) { /* ignore */ }
                }

                if (onFinalChange) {
                    onFinalChange({
                        min: minValue,
                        max: maxValue,
                        left: minValue - min,
                        middle: maxValue - minValue,
                        right: max - maxValue
                    });
                }
                setActiveHandle(null);
            }
        };

        const handleGlobalMove = (e) => {
            if (activeHandle) {
                handlePointerUpdate(e.clientX);
            }
        };

        if (activeHandle) {
            window.addEventListener('pointerup', handleGlobalUp);
            window.addEventListener('pointermove', handleGlobalMove);
            window.addEventListener('pointercancel', handleGlobalUp);
        }

        return () => {
            window.removeEventListener('pointerup', handleGlobalUp);
            window.removeEventListener('pointermove', handleGlobalMove);
            window.removeEventListener('pointercancel', handleGlobalUp);
        };
    }, [activeHandle, minValue, maxValue, min, max, onFinalChange]);

    const getPercentage = useCallback((value) => {
        return ((value - min) / (max - min)) * 100;
    }, [min, max]);

    const getValueFromPosition = useCallback((clientX) => {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const rawPercentage = x / rect.width;
        // Strict boundary clamping
        const percentage = Math.max(0, Math.min(1, rawPercentage));
        const rawValue = min + percentage * (max - min);
        // Add safety check for divide by zero or NaN
        if (isNaN(rawValue)) return min;

        // Final fix for floating point precision:
        const precision = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
        return Number((Math.round(rawValue / step) * step).toFixed(precision));
    }, [min, max, step]);

    const startDragging = (e, handle) => {
        // e.preventDefault(); // Removed to allow interaction while dragging if needed
        e.stopPropagation();
        if (containerRef.current && e.pointerId !== undefined) {
            try {
                containerRef.current.setPointerCapture(e.pointerId);
            } catch (err) {
                console.warn("[RangeSlider] Pointer capture failed:", err);
            }
        }
        setActiveHandle(handle);
    };

    const handlePointerUpdate = (clientX) => {
        if (!activeHandle) return;

        const newValue = getValueFromPosition(clientX);
        const minGap = step * 2; // Robust gap to prevent handles from getting stuck together

        if (activeHandle === 'min') {
            const lowerBound = minLimit !== undefined ? Math.max(min, minLimit) : min;
            const upperBound = maxLimit !== undefined ? Math.min(max, maxLimit) : max;
            const val = Math.max(lowerBound, Math.min(upperBound, newValue));
            const effectiveValue = Math.min(val, maxValue - minGap);
            
            if (effectiveValue !== minValue) {
                onChange({
                    min: effectiveValue,
                    max: maxValue,
                    left: Math.max(0, effectiveValue - min),
                    middle: Math.max(0, maxValue - effectiveValue),
                    right: Math.max(0, max - maxValue)
                });
            }
        } else {
            const lowerBound = minLimit !== undefined ? Math.max(min, minLimit) : min;
            const upperBound = maxLimit !== undefined ? Math.min(max, maxLimit) : max;
            const val = Math.max(lowerBound, Math.min(upperBound, newValue));
            const effectiveValue = Math.max(val, minValue + minGap);
            
            if (effectiveValue !== maxValue) {
                onChange({
                    min: minValue,
                    max: effectiveValue,
                    left: Math.max(0, minValue - min),
                    middle: Math.max(0, effectiveValue - minValue),
                    right: Math.max(0, max - effectiveValue)
                });
            }
        }
    };

    const handlePointerMove = (e) => {
        if (!activeHandle) return;
        e.stopPropagation();
        handlePointerUpdate(e.clientX);
    };

    const handlePointerUp = (e) => {
        if (!activeHandle) return;
        e.stopPropagation();

        if (containerRef.current && e.pointerId !== undefined) {
            try {
                containerRef.current.releasePointerCapture(e.pointerId);
            } catch (err) { /* ignore */ }
        }

        if (onFinalChange) {
            onFinalChange({
                min: minValue,
                max: maxValue,
                left: minValue - min,
                middle: maxValue - minValue,
                right: max - maxValue
            });
        }

        setActiveHandle(null);
    };

    // Essential positioning variables with robust clamping for visual boundaries
    const clampVal = (v) => Math.max(min, Math.min(max, v));
    const minPos = getPercentage(clampVal(minValue));
    const maxPos = getPercentage(clampVal(maxValue));

    // Global cursor and selection management
    useEffect(() => {
        if (activeHandle) {
            document.body.classList.add('grabbing-active');
            return () => document.body.classList.remove('grabbing-active');
        }
    }, [activeHandle]);

    return (
        <div
            ref={containerRef}
            className={`range-slider-container w-full ${compact ? 'px-1 pt-1 pb-1' : 'px-4 pt-10 pb-4'} select-none touch-none ${className || ''}`}
            style={{ 
                zIndex: activeHandle ? 1000 : 1, // Elevate during active interaction
                pointerEvents: 'auto' 
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onLostPointerCapture={(e) => {
                // Critical safety reset if focus is lost (e.g. system gesture or UI lag)
                if (activeHandle) {
                    if (onFinalChange) {
                        onFinalChange({
                            min: minValue,
                            max: maxValue,
                            left: minValue - min,
                            middle: maxValue - minValue,
                            right: max - maxValue
                        });
                    }
                    setActiveHandle(null);
                }
            }}
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
                {/* Full Track Fill - Handled below via segments if leftColor/middleColor/rightColor are provided */}
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
                        boxShadow: `0 0 10px ${middleColor || color}60`
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

                {/* Left Handle */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform hover:scale-110 flex items-center justify-center"
                    style={{ left: `${minPos}%`, borderColor: color, zIndex: activeHandle === 'min' ? 40 : 30 }}
                    onPointerDown={(e) => startDragging(e, 'min')}
                >
                    {/* Tooltip Label */}
                    {!hideLabels && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-lighter px-2 py-1 rounded-md text-[11px] font-black text-text border border-border/60 whitespace-nowrap shadow-xl pointer-events-none z-50">
                            {labelPrefix}{Number(minValue.toFixed(step.toString().includes('.') ? step.toString().split('.')[1].length : 0))}{labelSuffix}
                        </div>
                    )}
                    {/* Inner dot for handle */}
                    <div className="w-1.5 h-1.5 rounded-full pointer-events-none" style={{ backgroundColor: color, opacity: 0.5 }} />
                </div>

                {/* Right Handle */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white rounded-full shadow-xl cursor-grab active:cursor-grabbing border-2 transition-transform hover:scale-110 flex items-center justify-center"
                    style={{ left: `${maxPos}%`, borderColor: color, zIndex: activeHandle === 'max' ? 40 : 30 }}
                    onPointerDown={(e) => startDragging(e, 'max')}
                >
                    {/* Tooltip Label */}
                    {!hideLabels && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-lighter px-2 py-1 rounded-md text-[11px] font-black text-text border border-border/60 whitespace-nowrap shadow-xl pointer-events-none z-50">
                            {labelPrefix}{Number(maxValue.toFixed(step.toString().includes('.') ? step.toString().split('.')[1].length : 0))}{labelSuffix}
                        </div>
                    )}
                    {/* Inner dot for handle */}
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
                </div>
            </div>
        </div>
    );
};

export default RangeSlider;
