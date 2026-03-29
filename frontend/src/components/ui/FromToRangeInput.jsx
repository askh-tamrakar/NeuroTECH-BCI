import React from 'react';
import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react';
import CustomNumberInput from './CustomNumberInput';

export default function FromToRangeInput({
    fromValue,
    toValue,
    onFromChange,
    onToChange,
    fromMin = 0,
    fromMax,
    toMin = 1,
    toMax,
    step = 1,
    unit,
    accentColor = 'primary',
    className = '',
}) {
    return (
        <div className={`flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-surface h-9 shrink-0 ${className}`}>
            <div className="flex items-center gap-1 bg-bg/50 rounded px-1.5 py-1">
                <ArrowDownToLine size={14} className="text-primary font-bold" title="From" />
                <CustomNumberInput
                    value={Number(fromValue) || fromMin}
                    onChange={onFromChange}
                    min={fromMin}
                    max={fromMax}
                    step={step}
                    accentColor={accentColor}
                    className="w-[78px]"
                    unit={unit}
                    borderless={true}
                />
            </div>
            <span className="text-muted text-xs font-bold">to</span>
            <div className="flex items-center gap-1 bg-bg/50 rounded px-1.5 py-1">
                <ArrowUpToLine size={14} className="text-primary font-bold" title="To" />
                <CustomNumberInput
                    value={Number(toValue) || toMin}
                    onChange={onToChange}
                    min={toMin}
                    max={toMax}
                    step={step}
                    accentColor={accentColor}
                    className="w-[78px]"
                    unit={unit}
                    borderless={true}
                />
            </div>
        </div>
    );
}
