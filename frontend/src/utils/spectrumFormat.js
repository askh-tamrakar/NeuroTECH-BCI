const POWER_UNITS = [
    { limit: 1e9, divisor: 1e9, suffix: 'G uV^2' },
    { limit: 1e6, divisor: 1e6, suffix: 'M uV^2' },
    { limit: 1e3, divisor: 1e3, suffix: 'k uV^2' },
    { limit: 1, divisor: 1, suffix: 'uV^2' },
    { limit: 1e-3, divisor: 1e-3, suffix: 'm uV^2' },
    { limit: 1e-6, divisor: 1e-6, suffix: 'n uV^2' },
];

export function formatPowerValue(value, { decimals = 2, includeUnit = true } = {}) {
    if (!Number.isFinite(value) || value === 0) {
        return includeUnit ? `0 uV^2` : '0';
    }

    const absolute = Math.abs(value);
    const unit = POWER_UNITS.find((entry) => absolute >= entry.limit) || POWER_UNITS[POWER_UNITS.length - 1];
    const scaled = value / unit.divisor;
    const safeDecimals = Math.max(0, decimals);

    let text;
    if (Math.abs(scaled) >= 100) {
        text = scaled.toFixed(Math.min(1, safeDecimals));
    } else if (Math.abs(scaled) >= 10) {
        text = scaled.toFixed(Math.min(2, safeDecimals));
    } else {
        text = scaled.toFixed(safeDecimals);
    }

    const compact = text.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    return includeUnit ? `${compact} ${unit.suffix}` : compact;
}

export function getPowerScaleHint() {
    return '1 M uV^2 = 1,000,000 uV^2';
}

export function smoothSpectrumPoints(spectrum, radius = 3) {
    if (!Array.isArray(spectrum) || spectrum.length < 3) return spectrum;

    const safeRadius = Math.max(1, Math.min(radius, 12));

    return spectrum.map((point, index) => {
        let weightedPower = 0;
        let weightSum = 0;

        for (let offset = -safeRadius; offset <= safeRadius; offset += 1) {
            const neighbor = spectrum[index + offset];
            if (!neighbor) continue;

            const weight = safeRadius + 1 - Math.abs(offset);
            weightedPower += neighbor.power * weight;
            weightSum += weight;
        }

        return {
            ...point,
            power: weightSum > 0 ? weightedPower / weightSum : point.power,
        };
    });
}
