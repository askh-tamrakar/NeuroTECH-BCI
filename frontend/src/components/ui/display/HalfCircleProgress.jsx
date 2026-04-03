import React from 'react';

const HalfCircleProgress = ({
    progress = 0,
    size = 200,
    strokeWidth = 12,
    primaryColor = 'var(--text-success)',
    secondaryColor = 'var(--text-error)',
    sparkColor = 'var(--primary)',
    label = "Progress",
    statusText = "",
    hideLabels = false
}) => {
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = Math.PI * radius;
    // Show a tiny baseline as soon as it starts (>0) to indicate activity
    const visualProgress = progress > 0 ? Math.max(0.005, progress) : 0;
    const dashOffset = circumference - (visualProgress * circumference);


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
                    d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                    fill="none"
                    stroke={secondaryColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    style={{ opacity: 0.2 }}
                />

                {/* Foreground Progress */}
                <path
                    d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                    fill="none"
                    stroke={primaryColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{
                        transition: 'stroke-dashoffset 0.5s ease-out',
                        filter: `drop-shadow(0 0 8px ${primaryColor}66)`
                    }}
                />

                {/* Grinding Sparks at the leading edge of progress */}
                {progress > 0 && progress < 1 && (
                    <g
                        style={{ 
                            transition: 'all 0.5s ease-out',
                            filter: 'url(#grind-glow)'
                        }}
                        transform={`translate(${center + radius * Math.cos(Math.PI - (Math.min(1, visualProgress + 0.012) * Math.PI))}, ${size / 2 - radius * Math.sin(Math.PI - (Math.min(1, visualProgress + 0.012) * Math.PI))})`}
                    >
                        {/* Dynamic Spray Particles */}
                        {[...Array(12)].map((_, i) => {
                            const angleOffset = (Math.random() - 0.5) * 180;
                            const speed = 0.4 + Math.random() * 0.6;
                            const distance = 40 + Math.random() * 60;
                            const delay = Math.random() * 0.25;

                            // Tangent calculation for the spray direction
                            const currentAngle = (Math.PI - (progress * Math.PI)) * 180 / Math.PI;
                            const sprayAngle = currentAngle - 90 + angleOffset;

                            return (
                                <line
                                    key={i}
                                    x1="0" y1="0"
                                    x2={Math.cos(sprayAngle * Math.PI / 180) * 15}
                                    y2={Math.sin(sprayAngle * Math.PI / 180) * 15}
                                    stroke={sparkColor}
                                    strokeWidth={1.5 + Math.random() * 1.5}
                                    strokeLinecap="round"
                                    opacity="1"
                                >
                                    <animate
                                        attributeName="opacity"
                                        values="0;1;1;0"
                                        dur={`${speed}s`}
                                        begin={`${delay}s`}
                                        repeatCount="indefinite"
                                    />
                                    <animateTransform
                                        attributeName="transform"
                                        type="translate"
                                        values={`0,0; ${Math.cos(sprayAngle * Math.PI / 180) * distance},${Math.sin(sprayAngle * Math.PI / 180) * distance}`}
                                        dur={`${speed}s`}
                                        begin={`${delay}s`}
                                        repeatCount="indefinite"
                                    />
                                    <animate
                                        attributeName="stroke-dasharray"
                                        values="0,20; 10,10; 0,20"
                                        dur={`${speed}s`}
                                        begin={`${delay}s`}
                                        repeatCount="indefinite"
                                    />
                                </line>
                            );
                        })}

                        {/* Additional Glow Filter */}
                        <defs>
                            <filter id="grind-glow">
                                <feGaussianBlur stdDeviation="1.5" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>
                    </g>
                )}
            </svg>

            {/* Content in the middle-bottom */}
            {!hideLabels && (
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
            )}
        </div>
    );
};

export default HalfCircleProgress;
