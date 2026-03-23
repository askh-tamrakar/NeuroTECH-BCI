import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function CustomNumberInput({ value, onChange, min, max, step = 1, accentColor = 'primary', className = 'w-[72px]', unit }) {
    const [localValue, setLocalValue] = useState(value);
    const [inputValue, setInputValue] = useState(value.toString());
    const inputRef = useRef(null);

    useEffect(() => {
        setLocalValue(value);
        setInputValue(value.toString());
    }, [value]);

    const handleIncrement = () => {
        const stepVal = Number(step);
        let newVal = Number(localValue) + stepVal;
        if (max !== undefined && newVal > max) newVal = max;
        
        newVal = Number(newVal.toFixed(stepVal < 1 ? 1 : 0));
        
        setLocalValue(newVal);
        setInputValue(newVal.toString());
        onChange(newVal);
    };

    const handleDecrement = () => {
        const stepVal = Number(step);
        let newVal = Number(localValue) - stepVal;
        if (min !== undefined && newVal < min) newVal = min;
        
        newVal = Number(newVal.toFixed(stepVal < 1 ? 1 : 0));

        setLocalValue(newVal);
        setInputValue(newVal.toString());
        onChange(newVal);
    };

    const handleBlur = () => {
        let parsed = Number(inputValue);
        if (isNaN(parsed)) {
            parsed = localValue;
        } else {
            if (min !== undefined && parsed < min) parsed = min;
            if (max !== undefined && parsed > max) parsed = max;
        }
        setLocalValue(parsed);
        setInputValue(parsed.toString());
        if (parsed !== localValue) {
            onChange(parsed);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            inputRef.current?.blur();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            handleIncrement();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            handleDecrement();
        }
    };

    return (
        <div className={`flex items-center bg-bg/50 border border-${accentColor}-500/80 rounded-lg overflow-hidden hover:border-${accentColor}-500 transition-colors focus-within:border-${accentColor}-500 h-8 ${className}`}>
            <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`w-full bg-transparent outline-none pl-2 pr-1 text-[14px] font-extrabold font-mono text-center text-${accentColor}-500`}
            />
            {unit && <div className={`text-[14px] font-bold text-${accentColor}-500/80 pointer-events-none pr-1.5`}>{unit}</div>}
            <div className={`flex flex-col border-l border-${accentColor}-500/50 h-full shrink-0`}>
                <button 
                    onPointerDown={(e) => { e.preventDefault(); handleIncrement(); }}
                    className={`flex-1 flex items-center justify-center px-1 hover:bg-${accentColor}-500/20 text-${accentColor}-500 transition-colors cursor-pointer touch-none border-b border-${accentColor}-500/50 outline-none`}
                >
                    <ChevronUp size={12} strokeWidth={4} />
                </button>
                <button 
                    onPointerDown={(e) => { e.preventDefault(); handleDecrement(); }}
                    className={`flex-1 flex items-center justify-center px-1 hover:bg-${accentColor}-500/20 text-${accentColor}-500 transition-colors cursor-pointer touch-none outline-none`}
                >
                    <ChevronDown size={12} strokeWidth={4} />
                </button>
            </div>
        </div>
    );
}
