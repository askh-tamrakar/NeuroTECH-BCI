import { motion, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

const OPACITY_FACTOR = 1.5; // Controls how fast it fades. Higher = sharper fade.

function Number({ mv, number, className, style }) {
    let styleParams = useTransform(mv, latest => {
        let placeValue = latest % 10;
        let offset = (10 + number - placeValue) % 10;

        let memo = offset; // 1 unit = 1 height
        if (offset > 5) {
            memo -= 10;
        }

        // Calculate opacity based on distance from center (0)
        let dist = Math.min(offset, 10 - offset);
        let opacity = Math.max(0, 1 - (dist * OPACITY_FACTOR));

        return { y: memo, opacity };
    });

    return (
        <motion.span
            className={className}
            style={{
                ...style,
                y: useTransform(styleParams, s => `${s.y}em`),
                opacity: useTransform(styleParams, s => s.opacity),
                position: 'absolute',
                display: 'block'
            }}
        >
            {number}
        </motion.span>
    );
}

function Digit({ place, value, className, style }) {
    let valueRoundedToPlace = Math.floor(value / place)
    let animatedValue = useSpring(valueRoundedToPlace, {
        stiffness: 100, // Reduced from 400 for slower bounce
        damping: 20,    // Increased from 15 for less overshoot
        mass: 1.5       // Added mass for a heavier, slower feel
    })

    useEffect(() => {
        animatedValue.set(valueRoundedToPlace)
    }, [animatedValue, valueRoundedToPlace])

    return (
        <div style={{ height: '1em', position: 'relative', width: '0.6em', overflow: 'hidden', display: 'inline-block' }}>
            {[...Array(10).keys()].map((i) => (
                <Number key={i} mv={animatedValue} number={i} className={className} style={style} />
            ))}
        </div>
    )
}

export default function Counter({
    value,
    fontSize = '1em',
    places = [100, 10, 1],
    className,
    style
}) {
    return (
        <div style={{ fontSize, display: 'flex', ...style }} className={className}>
            {places.map(place => (
                <Digit key={place} place={place} value={value} />
            ))}
        </div>
    );
}
