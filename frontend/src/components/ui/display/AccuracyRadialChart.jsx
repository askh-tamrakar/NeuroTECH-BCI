import { useState, useMemo } from 'react';
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
    mode = 'accuracy'
}) => {
    // 1: Inner (Test), 2: Middle (Validation), 3: Outer (Train)
    const [hovered, setHovered] = useState(null); // 'test', 'val', or 'train'

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

    // Split verdict description into lines for the "stacked" effect the user wants
    const descLines = useMemo(() => {
        if (!verdict?.desc) return ["Awaiting", "Data"];
        if (verdict.desc.toLowerCase().includes("generalized well")) {
            return ["model", "generalized", "well"];
        }
        if (verdict.desc.includes('|')) return verdict.desc.split('|');
        return verdict.desc.split(' ');
    }, [verdict?.desc]);

    return (
        <div className="flex flex-col items-center justify-center h-full w-full gap-0">
            <div className="flex-1 w-full relative min-h-0">
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
                            domain={mode === 'split' ? [0, 100] : [75, 100]}
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

                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                            {hovered && activeItem ? (
                                <>
                                    <tspan
                                        x="50%"
                                        dy="0.3em"
                                        className={cx("text-[32px] font-black")}
                                        fill={activeItem.fill}
                                    >
                                        {activeItem.value.toFixed(1)}%
                                    </tspan>
                                </>
                            ) : (
                                <>
                                    {/* Verdict Title on Top */}
                                    <tspan
                                        x="50%"
                                        dy="-1em"
                                        className={cx("text-[14px] font-black uppercase tracking-widest", verdict?.color || "text-[var(--text)]")}
                                        fill="currentColor"
                                    >
                                        {verdict?.text || "MODEL READY"}
                                    </tspan>
                                    {/* Multiline description breakdown */}
                                    {descLines.map((line, idx) => (
                                        <tspan
                                            key={idx}
                                            x="50%"
                                            dy={idx === 0 ? "1.5em" : "1.1em"}
                                            className="text-[10px] fill-[var(--muted)] font-mono uppercase tracking-tighter opacity-70"
                                        >
                                            {line}
                                        </tspan>
                                    ))}
                                </>
                            )}
                        </text>
                    </RadialBarChart>
                </ResponsiveContainer>
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
