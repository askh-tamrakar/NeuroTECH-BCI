import React from 'react';

export default function InlineModeToggle({
    value,
    onChange,
    options = [],
    className = '',
    disabled = false,
}) {
    const [left, right] = options;
    if (!left || !right) return null;

    const isRightActive = value === right.id;

    return (
        <div className={`inline-flex items-center gap-2 ${disabled ? 'opacity-60' : ''} ${className}`}>
            <button
                type="button"
                onClick={() => !disabled && onChange?.(left.id)}
                className={`${left.label ? 'text-[14px] pl-1 border-l-2 border-t-2 border-b-2 border-[var(--border)] font-bold uppercase' : ''} ${isRightActive ? 'text-[var(--text-secondary)]' : 'text-[var(--primary)]'}`}
            >
                {left.label}
            </button>

            <button
                type="button"
                onClick={() => !disabled && onChange?.(isRightActive ? left.id : right.id)}
                className={`relative h-[28px] w-[56px] rounded-full border-2  transition-colors ${isRightActive ? 'bg-primary border-text' : 'bg-bg border-border'}`}
                aria-label={`${left.label} / ${right.label}`}
                disabled={disabled}
            >
                <div
                    className={`absolute top-0.5 bottom-0.5 w-[20px] rounded-full shadow-sm transition-all duration-200 ${isRightActive ? 'left-[calc(100%-22px)] bg-bg' : 'left-0.5 bg-text'}`}
                />
            </button>

            <button
                type="button"
                onClick={() => !disabled && onChange?.(right.id)}
                className={`${right.label ? 'text-[14px] pr-1 border-r-2 border-t-2 border-b-2 border-[var(--border)] font-bold uppercase' : ''} ${!isRightActive ? 'text-[var(--text-secondary)]' : 'text-[var(--primary)]'}`}
            >
                {right.label}
            </button>
        </div >

    );
}
