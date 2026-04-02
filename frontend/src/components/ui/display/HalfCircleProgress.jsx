import React from 'react';

const HalfCircleProgress = ({ 
    progress = 0, 
    size = 200, 
    strokeWidth = 12, 
    primaryColor = 'var(--primary)', 
    secondaryColor = 'var(--border)',
    label = "Progress",
    statusText = ""
}) => {
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    // Circular circumference = 2 * pi * radius. Half-circle = pi * radius.
    const circumference = Math.PI * radius;
    const dashOffset = circumference - (progress * circumference);

    // SVG path for a 180-degree arc (top half, rotated 180 to start from bottom-left)
    // We want it to look like a speedometer: left bottom corner to right bottom corner.
    // Coordinates:
    // Move to (strokeWidth/2, size) -- bottom left
    // Arc to (size - strokeWidth/2, size) with radius 'radius'
    
    // Actually, a simpler way is to draw a full circle and then rotate/clip or just use dashArray.
    // For a 180-degree "Gauge" style (left to right):
    // Start at -180 degrees (left), end at 0 degrees (right).
    
    return (
        <div style={{ width: size, height: size / 2 + 10, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg 
                width={size} 
                height={size / 2 + 10} 
                viewBox={`0 0 ${size} ${size / 2 + 10}`}
                style={{ transform: 'rotate(0deg)' }}
            >
                {/* Background Track */}
                <path
                    d={`M ${strokeWidth/2} ${size/2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth/2} ${size/2}`}
                    fill="none"
                    stroke={secondaryColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    style={{ opacity: 0.2 }}
                />
                
                {/* Foreground Progress */}
                <path
                    d={`M ${strokeWidth/2} ${size/2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth/2} ${size/2}`}
                    fill="none"
                    stroke={primaryColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ 
                        transition: 'stroke-dashoffset 0.5s ease-out',
                        filter: `drop-shadow(0 0 8px ${primaryColor}44)` 
                    }}
                />
            </svg>

            {/* Content in the middle-bottom */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center translate-y-[-10px]">
                <span className="text-4xl font-black text-[var(--text)] font-mono leading-none">
                    {Math.round(progress * 100)}<span className="text-sm opacity-40 ml-0.5">%</span>
                </span>
                <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-[0.2em] mt-1">
                    {label}
                </span>
                {statusText && (
                    <span className="text-[9px] font-medium text-[var(--primary)] uppercase mt-0.5 animate-pulse">
                        {statusText}
                    </span>
                )}
            </div>
        </div>
    );
};

export default HalfCircleProgress;
