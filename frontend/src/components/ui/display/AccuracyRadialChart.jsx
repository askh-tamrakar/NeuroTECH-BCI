import { useEffect, useState, useMemo, useRef } from 'react';
import {
    PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, Cell
} from "recharts";
import { cx } from '../../../utils/cx';
// --- RECHARTS HELPERS ---



/**
 * Renders the tooltip content for a chart.
 */
export const ChartTooltipContent = ({ active, payload, label, isRadialChart, isPieChart, formatter, labelFormatter }) => {
    if (!(active && payload && payload.length)) return null;
    const isSingleDataPoint = payload.length === 1;
    let title = isSingleDataPoint ? payload[0].value : label;
    let secondaryTitle = isSingleDataPoint ? (isRadialChart ? payload[0].payload.name : isPieChart ? payload[0].name : label) : payload;

    title = isSingleDataPoint && formatter ? formatter(title, payload?.[0].name || label, payload[0], 0, payload) : labelFormatter ? labelFormatter(title, payload) : title;
    secondaryTitle = isSingleDataPoint && labelFormatter ? labelFormatter(secondaryTitle, payload) : secondaryTitle;

    return (
        <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 py-2 shadow-lg backdrop-blur-md">
            <p className="text-xs font-semibold text-[var(--text)]">{title}</p>
            {!secondaryTitle ? null : Array.isArray(secondaryTitle) ? (
                <div>
                    {secondaryTitle.map((entry, index) => (
                        <p key={index} className="text-[10px] text-[var(--muted)]">
                            {`${entry.name}: ${formatter ? formatter(entry.value, entry.name, entry, index, entry.payload) : entry.value}`}
                        </p>
                    ))}
                </div>
            ) : (
                <p className="text-[10px] text-[var(--muted)]">{secondaryTitle}</p>
            )}
        </div>
    );
};

/**
 * Premium Radial Accuracy Chart Component.
 */
export const AccuracyRadialChart = ({
    trainAcc,
    valAcc,
    testAcc,
    trainSamples,
    valSamples,
    testSamples,
    verdict,
    mode = 'accuracy',
    kFolds,
    onFoldChange
}) => {
    // 1: Inner (Test), 2: Middle (Validation), 3: Outer (Train)
    const [hovered, setHovered] = useState(null); // 'test', 'val', or 'train'
    const [localK, setLocalK] = useState(kFolds || '');
    const inputRef = useRef(null);

    // Sync local state when external kFolds changes (e.g. from slider)
    useEffect(() => {
        setLocalK(kFolds || '');
    }, [kFolds]);

    // Global Blur workaround for SVG foreignObject
    useEffect(() => {
        const handleClickOutside = (e) => {
            // Use capture phase (true) to intercept click before SVG chart stops it
            if (inputRef.current && !inputRef.current.contains(e.target)) {
                inputRef.current.blur();
            }
        };
        window.addEventListener('mousedown', handleClickOutside, true);
        return () => window.removeEventListener('mousedown', handleClickOutside, true);
    }, []);

    const data = useMemo(() => [
        {
            name: "Test",
            value: (testAcc || 0) * 100,
            samples: testSamples || 0,
            id: 'test',
            fill: 'var(--accent)',
            className: "text-[var(--accent)]"
        },
        {
            name: "Validation",
            value: (valAcc || 0) * 100,
            samples: valSamples || 0,
            id: 'val',
            fill: 'var(--muted)',
            className: "text-[var(--muted)]"
        },
        {
            name: "Train",
            value: (trainAcc || 0) * 100,
            samples: trainSamples || 0,
            id: 'train',
            fill: 'var(--text)',
            className: "text-[var(--text)]"
        }
    ], [trainAcc, valAcc, testAcc, trainSamples, valSamples, testSamples, mode]);

    const activeItem = hovered ? data.find(m => m.id === hovered) : null;
    const activeIndex = hovered ? data.findIndex(m => m.id === hovered) : -1;

    // Removed descLines as requested to save space inside the rings

    const domain = useMemo(() => {
        if (mode === 'split') return [0, 100];

        // Extract accuracy values (0-100 range from data)
        const values = data.map(d => d.value);
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);

        // Find the 25% segments (0-25, 25-50, 50-75, 75-100)
        let start = Math.floor(minVal / 25) * 25;
        let end = Math.ceil(maxVal / 25) * 25;

        // Ensure we always have at least a 25% range
        if (end - start < 25) {
            if (end === 100) start = 75;
            else if (start === 0) end = 25;
            else end = start + 25;
        }

        // Clamp to valid ranges
        return [Math.max(0, start), Math.min(100, end)];
    }, [data, mode]);

    return (
        <div className="flex flex-col items-center justify-center h-full w-full gap-0">
            <div className="flex-1 w-full relative min-h-0 group/radial-chart overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                        data={data}
                        innerRadius="65%"
                        outerRadius="105%"
                        startAngle={90}
                        endAngle={360 + 90}
                        activeTooltipIndex={activeIndex}
                        className="font-medium text-[var(--muted)]"
                        onMouseMove={(state) => {
                            if (state.activePayload) {
                                setHovered(state.activePayload[0].payload.id);
                            }
                        }}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <PolarAngleAxis
                            tick={false}
                            axisLine={false}
                            domain={domain}
                            type="number"
                            reversed
                        />

                        <RadialBar
                            isAnimationActive={true}
                            dataKey="value"
                            cornerRadius={99}
                            fill="currentColor"
                            barSize={14}
                            background={{
                                fill: "var(--border)",
                                opacity: 0.15
                            }}
                            onMouseEnter={(entry) => setHovered(entry.id)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.fill}
                                    fillOpacity={hovered ? (hovered === entry.id ? 1 : 0.25) : 1}
                                />
                            ))}
                        </RadialBar>
                    </RadialBarChart>
                </ResponsiveContainer>

                {/* --- STABLE HTML OVERLAY (Isolated from SVG Hovers) --- */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <div className="flex flex-col items-center justify-center pointer-events-auto">
                        {!hovered && mode === 'split' ? (
                            <div className="flex flex-col items-center justify-center">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={localK === 0 ? '0' : (localK || '')}
                                    onChange={(e) => {
                                        const valStr = e.target.value.replace(/\D/g, '');
                                        setLocalK(valStr);
                                        if (onFoldChange) onFoldChange(valStr === '' ? '' : parseInt(valStr));
                                    }}
                                    onBlur={() => {
                                        const val = parseInt(localK);
                                        if (!localK || isNaN(val) || val < 2) {
                                            setLocalK(2);
                                            if (onFoldChange) onFoldChange(2);
                                        } else if (val > 20) {
                                            setLocalK(20);
                                            if (onFoldChange) onFoldChange(20);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.target.blur();
                                    }}
                                    className={cx(
                                        "w-24 text-center bg-transparent border-none outline-none p-0 text-[42px] font-black tracking-tighter transition-all",
                                        verdict?.color || "text-[var(--text)]"
                                    )}
                                    style={{
                                        caretColor: 'var(--primary)',
                                        fontVariantNumeric: 'tabular-nums',
                                        lineHeight: '1',
                                        height: '52px'
                                    }}
                                />
                                <div className={cx(
                                    "text-[14px] font-black uppercase tracking-[0.3em] mt-[-4px] opacity-70",
                                    "text-[var(--test-tertiary)]"
                                )}>
                                    Folds
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center">
                                {hovered && activeItem ? (
                                    <div className={cx("text-[42px] font-black tracking-tighter")} style={{ color: activeItem.fill }}>
                                        {activeItem.value.toFixed(1)}%
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center">
                                        {(verdict?.text || "MODEL READY").split(' ').map((line, idx, arr) => (
                                            <div
                                                key={idx}
                                                className={cx(
                                                    "font-black uppercase tracking-[0.1em] leading-tight",
                                                    "text-[20px]",
                                                    verdict?.color || "text-[var(--text)]"
                                                )}
                                            >
                                                {line}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 w-full border-y border-[var(--border)] pt-0.5 pb-0.5">
                {[...data].reverse().map(m => (
                    <div
                        key={m.id}
                        className={cx(
                            "flex flex-col items-center cursor-pointer transition-all duration-300",
                            hovered === m.id ? "scale-105" : hovered ? "opacity-30 grayscale-[50%]" : "opacity-100"
                        )}
                        onMouseEnter={() => setHovered(m.id)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <span className="text-[12px] font-black uppercase text-[var(--muted)] tracking-widest leading-none mb-0.5">{m.name}</span>
                        <span className="text-[12px] font-mono font-bold text-[var(--text)]">{m.samples}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};