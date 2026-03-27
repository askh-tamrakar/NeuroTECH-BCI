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
        <div className={`inline-flex items-center gap-3 ${disabled ? 'opacity-60' : ''} ${className}`}>
            <button
                type="button"
                onClick={() => !disabled && onChange?.(left.id)}
                className={`text-sm font-black uppercase tracking-[0.2em] transition-colors ${!isRightActive ? 'text-primary' : 'text-muted hover:text-text'}`}
            >
                {left.label}
            </button>

            <button
                type="button"
                onClick={() => !disabled && onChange?.(isRightActive ? left.id : right.id)}
                className="relative h-9 w-[72px] rounded-full border-2 border-primary/80 bg-bg/80 shadow-inner transition-colors"
                aria-label={`${left.label} / ${right.label}`}
                disabled={disabled}
            >
                <div
                    className={`absolute top-1 bottom-1 w-7 rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.35)] transition-all duration-200 ${isRightActive ? 'left-[36px]' : 'left-1'}`}
                />
            </button>

            <button
                type="button"
                onClick={() => !disabled && onChange?.(right.id)}
                className={`text-sm font-black uppercase tracking-[0.2em] transition-colors ${isRightActive ? 'text-primary' : 'text-muted hover:text-text'}`}
            >
                {right.label}
            </button>
        </div>
    );
}
