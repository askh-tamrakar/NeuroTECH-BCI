/** @type {import('tailwindcss').Config} */

function withOpacity(variableName) {
	return ({ opacityValue }) => {
		if (opacityValue !== undefined) {
			return `rgba(var(${variableName}-rgb), ${opacityValue})`;
		}
		return `var(${variableName})`;
	};
}

export default {
	darkMode: ["class"],
	content: [
		"./index.html",
		"./src/**/*.{js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			colors: {
				bg: withOpacity('--bg'),
				surface: withOpacity('--surface'),
				text: withOpacity('--text'),
				muted: {
					DEFAULT: withOpacity('--muted'),
					foreground: 'var(--muted-foreground)'
				},
				primary: {
					DEFAULT: withOpacity('--primary'),
					foreground: 'var(--primary-foreground)'
				},
				'primary-contrast': 'var(--primary-contrast)',
				accent: {
					DEFAULT: withOpacity('--accent'),
					foreground: 'var(--accent-foreground)'
				},
				border: withOpacity('--border'),
				background: withOpacity('--background'),
				foreground: withOpacity('--foreground'),
				card: {
					DEFAULT: withOpacity('--card'),
					foreground: 'var(--card-foreground)'
				},
				popover: {
					DEFAULT: withOpacity('--popover'),
					foreground: 'var(--popover-foreground)'
				},
				secondary: {
					DEFAULT: withOpacity('--secondary'),
					foreground: 'var(--secondary-foreground)'
				},
				destructive: {
					DEFAULT: withOpacity('--destructive'),
					foreground: 'var(--destructive-foreground)'
				},
				input: 'var(--input)',
				ring: 'var(--ring)',
				chart: {
					'1': 'var(--chart-1)',
					'2': 'var(--chart-2)',
					'3': 'var(--chart-3)',
					'4': 'var(--chart-4)',
					'5': 'var(--chart-5)'
				}
			},
			boxShadow: {
				glow: '0 0 10px var(--primary)',
				card: '0 10px 30px var(--shadow)'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
}
