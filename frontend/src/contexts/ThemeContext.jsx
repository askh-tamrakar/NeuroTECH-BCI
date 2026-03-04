import React, { createContext, useContext, useState, useEffect } from 'react';

// Ported from index.css
const hexToRgbTriple = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return isNaN(r) ? null : `${r}, ${g}, ${b}`;
};

const DEFAULT_THEMES = [
    {
        id: 'theme-yellow-dark',
        name: 'Golden Eclipse',
        type: 'default',
        colors: {
            '--bg': '#2C2B28',
            '--surface': '#3B392F',
            '--text': '#FFF7B0',
            '--muted': '#D9C974',
            '--primary': '#F2B01E',
            '--primary-contrast': '#2C2B28',
            '--accent': '#E3A500',
            '--border': '#C69C00',
            '--shadow': 'rgba(0,0,0,0.55)',
            // Dino
            '--day': '#FFF7B0',
            '--night': '#2C2B28',
            '--tree-day': '#D9C974',
            '--tree-night': '#B8860B',
            '--cloud-day': '#D9C974',
            '--cloud-night': '#554d24',
            '--sun-day': '#F2B01E',
            '--sun-night': '#B8860B',
            '--moon-day': '#fff',
            '--moon-night': '#FFF7B0',
            '--sky-day': '#FFFFE0',
            '--sky-night': '#2C2B28',
            // Extended Text
            '--text-secondary': '#D9C974',
            '--text-tertiary': '#A18F3B',
            '--text-highlight': '#F2B01E',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#F2B01E',
            '--heading': '#FFF7B0',
            '--label': '#D9C974',
            // Sections & Panels
            '--section-bg': '#3B392F',
            '--section-border': '#C69C00',
            '--panel-bg': '#3B392F',
            '--panel-border': '#4B493F',
            '--header-bg': '#2C2B28',
            '--header-text': '#F2B01E',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#F2B01E',
            '--event-text': '#FFF7B0',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.3)',
            '--selection-border': '#E3A500',
            // Graphs
            '--graph-line-1': '#F2B01E',
            '--graph-line-2': '#E3A500',
            '--graph-bg': '#2C2B28',
            '--graph-grid': '#4B493F',
            '--graph-text': '#D9C974',
        }
    },
    {
        id: 'theme-yellow',
        name: 'Golden Ember',
        type: 'default',
        colors: {
            '--bg': '#FFFDE7',
            '--surface': '#FFE680',
            '--text': '#2C2C2C',
            '--muted': '#8D7A2F',
            '--primary': '#F2B01E',
            '--primary-contrast': '#ffffff',
            '--accent': '#E3A500',
            '--border': '#C69C00',
            '--shadow': 'rgba(0,0,0,0.25)',
            // Dino
            '--day': '#FFFDE7',
            '--night': '#1c1a17',
            '--tree-day': '#2C2B28',
            '--tree-night': '#A18F3B',
            '--cloud-day': '#F2B01E',
            '--cloud-night': '#554d24',
            '--sun-day': '#F2B01E',
            '--sun-night': '#F2B01E',
            '--moon-day': '#FFFFFF',
            '--moon-night': '#FFE680',
            '--sky-day': '#FFFDE7',
            '--sky-night': '#1c1a17',
            // Extended Text
            '--text-secondary': '#8D7A2F',
            '--text-tertiary': '#5D4037',
            '--text-highlight': '#F2B01E',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#2C2C2C',
            '--heading': '#CC8E00',
            '--label': '#8D7A2F',
            // Sections & Panels
            '--section-bg': '#FFE680',
            '--section-border': '#C69C00',
            '--panel-bg': '#FFFACD',
            '--panel-border': '#FFE680',
            '--header-bg': '#FFF7B0',
            '--header-text': '#2C2C2C',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#F2B01E',
            '--event-text': '#2C2C2C',
            '--selection-bg': 'rgba(var(--primary-rgb), 0.25)',
            '--selection-border': '#F2B01E',
            // Graphs
            '--graph-line-1': '#F2B01E',
            '--graph-line-2': '#B8860B',
            '--graph-bg': '#FFFDE7',
            '--graph-grid': '#D9C260',
            '--graph-text': '#5D4037',
        }
    },
    {
        id: 'theme-vibrant',
        name: 'Vibrant Warm',
        type: 'default',
        colors: {
            '--bg': '#344E5C',
            '--surface': '#4AB19D',
            '--text': '#061016',
            '--muted': '#ffeeb9',
            '--primary': '#EF3D59',
            '--primary-contrast': '#16070b',
            '--accent': '#E17A47',
            '--border': '#3e5c6c',
            '--shadow': 'rgba(10, 19, 26, 0.5)',
            // Dino
            '--day': '#FFF8E1',
            '--night': '#344E5C',
            '--tree-day': '#344E5C',
            '--tree-night': '#061016',
            '--cloud-day': '#D9C974',
            '--cloud-night': '#3e5c6c',
            '--sun-day': '#EF3D59',
            '--sun-night': '#C0392B',
            '--moon-day': '#fff',
            '--moon-night': '#FFEEB9',
            '--sky-day': '#FFECB3',
            '--sky-night': '#344E5C',
            // Extended Text
            '--text-secondary': '#FFECC8',
            '--text-tertiary': '#D9C974',
            '--text-highlight': '#EF3D59',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#061016',
            '--heading': '#EF3D59',
            '--label': '#FFECC8',
            // Sections & Panels
            '--section-bg': '#4AB19D',
            '--section-border': '#3E5C6C',
            '--panel-bg': '#5AC0AC',
            '--panel-border': '#4AB19D',
            '--header-bg': '#344E5C',
            '--header-text': '#EF3D59',
            // Interactive/Events
            '--event-bg': 'rgba(239, 61, 89, 0.2)',
            '--event-border': '#EF3D59',
            '--event-text': '#061016',
            '--selection-bg': 'rgba(225, 122, 71, 0.3)',
            '--selection-border': '#E17A47',
            // Graphs
            '--graph-line-1': '#EF3D59',
            '--graph-line-2': '#E17A47',
            '--graph-bg': '#344E5C',
            '--graph-grid': '#3E5C6C',
            '--graph-text': '#FFECC8',
        }
    },
    {
        id: 'theme-blush',
        name: 'Blush Tide',
        type: 'default',
        colors: {
            '--bg': '#305F72',
            '--surface': '#F1D1B5',
            '--text': '#10222b',
            '--muted': '#f7e7dc',
            '--primary': '#F18C8E',
            '--primary-contrast': '#221a15',
            '--accent': '#56BEA6',
            '--border': '#3b7187',
            '--shadow': 'rgba(3, 19, 33, 0.5)',
            // Dino
            '--day': '#E0F2F1',
            '--night': '#305F72',
            '--tree-day': '#305F72',
            '--tree-night': '#10222b',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#3b7187',
            '--sun-day': '#F18C8E',
            '--sun-night': '#C0392B',
            '--moon-day': '#fff',
            '--moon-night': '#F7E7DC',
            '--sky-day': '#B2DFDB',
            '--sky-night': '#305F72',
            // Extended Text
            '--text-secondary': '#F7E7DC',
            '--text-tertiary': '#F1D1B5',
            '--text-highlight': '#F18C8E',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#10222B',
            '--heading': '#F18C8E',
            '--label': '#3B7187',
            // Sections & Panels
            '--section-bg': '#F1D1B5',
            '--section-border': '#3B7187',
            '--panel-bg': '#FDF4EC',
            '--panel-border': '#F1D1B5',
            '--header-bg': '#305F72',
            '--header-text': '#F18C8E',
            // Interactive/Events
            '--event-bg': 'rgba(241, 140, 142, 0.2)',
            '--event-border': '#F18C8E',
            '--event-text': '#10222B',
            '--selection-bg': 'rgba(86, 190, 166, 0.3)',
            '--selection-border': '#56BEA6',
            // Graphs
            '--graph-line-1': '#F18C8E',
            '--graph-line-2': '#56BEA6',
            '--graph-bg': '#305F72',
            '--graph-grid': '#3B7187',
            '--graph-text': '#F7E7DC',
        }
    },

    {
        id: 'theme-ember',
        name: 'Ember Noir',
        type: 'default',
        colors: {
            '--bg': '#1B1833',
            '--surface': '#441752',
            '--text': '#FFF9F0',
            '--muted': '#E6C9AE',
            '--primary': '#F29F58',
            '--primary-contrast': '#1A0E12',
            '--accent': '#AB4459',
            '--border': '#2C143D',
            '--shadow': 'rgba(0, 0, 0, 0.5)',
            // Dino
            '--day': '#FFFDE7',
            '--night': '#1B1833',
            '--tree-day': '#441752',
            '--tree-night': '#0a0815',
            '--cloud-day': '#fff',
            '--cloud-night': '#2C143D',
            '--sun-day': '#F29F58',
            '--sun-night': '#D35400',
            '--moon-day': '#fff',
            '--moon-night': '#E6C9AE',
            '--sky-day': '#FFFDE7',
            '--sky-night': '#1B1833',
            // Extended Text
            '--text-secondary': '#E6C9AE',
            '--text-tertiary': '#AB4459',
            '--text-highlight': '#F29F58',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#FFF9F0',
            '--heading': '#F29F58',
            '--label': '#E6C9AE',
            // Sections & Panels
            '--section-bg': '#441752',
            '--section-border': '#2C143D',
            '--panel-bg': '#541E66',
            '--panel-border': '#441752',
            '--header-bg': '#1B1833',
            '--header-text': '#F29F58',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.15)',
            '--event-border': '#E11D48',
            '--event-text': '#FFF1F2',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.2)',
            '--selection-border': '#AB4459',
            // Graphs
            '--graph-line-1': '#F29F58',
            '--graph-line-2': '#AB4459',
            '--graph-bg': '#1B1833',
            '--graph-grid': '#2C143D',
            '--graph-text': '#E6C9AE',
        }
    },
    {
        id: 'theme-rose',
        name: 'Crimson Rose',
        type: 'default',
        colors: {
            '--bg': '#2C2C2C',
            '--surface': '#522546',
            '--text': '#ffffff',
            '--muted': '#e8d7df',
            '--primary': '#F7374F',
            '--primary-contrast': '#2C2C2C',
            '--accent': '#88304E',
            '--border': '#6a3c59',
            '--shadow': 'rgba(0,0,0,0.35)',
            // Dino
            '--day': '#FFE4E1',
            '--night': '#2C2C2C',
            '--tree-day': '#D47995',
            '--tree-night': '#522546',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#6a3c59',
            '--sun-day': '#FFC0CB',
            '--sun-night': '#F7374F',
            '--moon-day': '#ffffff',
            '--moon-night': '#e8d7df',
            '--sky-day': '#FFE4E1',
            '--sky-night': '#2C2C2C',
            // Extended Text
            '--text-secondary': '#E8D7DF',
            '--text-tertiary': '#D47995',
            '--text-highlight': '#F7374F',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#FFFFFF',
            '--heading': '#F7374F',
            '--label': '#E8D7DF',
            // Sections & Panels
            '--section-bg': '#522546',
            '--section-border': '#6A3C59',
            '--panel-bg': '#642D55',
            '--panel-border': '#522546',
            '--header-bg': '#2C2C2C',
            '--header-text': '#F7374F',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#F7374F',
            '--event-text': '#FFFFFF',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.3)',
            '--selection-border': '#88304E',
            // Graphs
            '--graph-line-1': '#F7374F',
            '--graph-line-2': '#FF8FA3',
            '--graph-bg': '#2C2C2C',
            '--graph-grid': '#6A3C59',
            '--graph-text': '#E8D7DF',
        }
    },

    {
        id: 'theme-olive',
        name: 'Verdant Olive',
        type: 'default',
        colors: {
            '--bg': '#2F5249',
            '--surface': '#437057',
            '--text': '#f7fff8',
            '--muted': '#dcebdc',
            '--primary': '#E3DE61',
            '--primary-contrast': '#2F5249',
            '--accent': '#97B067',
            '--border': '#5a8b74',
            '--shadow': 'rgba(0,0,0,0.35)',
            // Dino
            '--day': '#F0FFF0',
            '--night': '#2F5249',
            '--tree-day': '#437057',
            '--tree-night': '#1a332d',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#5a8b74',
            '--sun-day': '#E3DE61',
            '--sun-night': '#FFB347',
            '--moon-day': '#ffffff',
            '--moon-night': '#DCEBDC',
            '--sky-day': '#E6F5E6',
            '--sky-night': '#2F5249',
            // Extended Text
            '--text-secondary': '#DCEBDC',
            '--text-tertiary': '#97B067',
            '--text-highlight': '#E3DE61',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#F7FFF8',
            '--heading': '#E3DE61',
            '--label': '#DCEBDC',
            // Sections & Panels
            '--section-bg': '#437057',
            '--section-border': '#5A8B74',
            '--panel-bg': '#4E8064',
            '--panel-border': '#437057',
            '--header-bg': '#2F5249',
            '--header-text': '#E3DE61',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#E3DE61',
            '--event-text': '#F7FFF8',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.3)',
            '--selection-border': '#97B067',
            // Graphs
            '--graph-line-1': '#E3DE61',
            '--graph-line-2': '#97B067',
            '--graph-bg': '#2F5249',
            '--graph-grid': '#5A8B74',
            '--graph-text': '#DCEBDC',
        }
    },
    {
        id: 'theme-slate',
        name: 'Midnight Slate',
        type: 'default',
        colors: {
            '--bg': '#0b0d12',
            '--surface': '#121723',
            '--text': '#f1f5f9',
            '--muted': '#c7d0dd',
            '--primary': '#7aa2f7',
            '--primary-contrast': '#0b0d12',
            '--accent': '#a6adc8',
            '--border': '#202534',
            '--shadow': 'rgba(2, 4, 9, 0.55)',
            // Dino
            '--day': '#F1F5F9',
            '--night': '#0b0d12',
            '--tree-day': '#A6ADC8',
            '--tree-night': '#1A2131',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#202534',
            '--sun-day': '#F9A8D4',
            '--sun-night': '#7C3AED',
            '--moon-day': '#fff',
            '--moon-night': '#C7D0DD',
            '--sky-day': '#E2E8F0',
            '--sky-night': '#0b0d12',
            // Extended Text
            '--text-secondary': '#C7D0DD',
            '--text-tertiary': '#7A6B29',
            '--text-highlight': '#7AA2F7',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#F1F5F9',
            '--heading': '#7AA2F7',
            '--label': '#C7D0DD',
            // Sections & Panels
            '--section-bg': '#121723',
            '--section-border': '#202534',
            '--panel-bg': '#1A2131',
            '--panel-border': '#121723',
            '--header-bg': '#0B0D12',
            '--header-text': '#7AA2F7',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#7AA2F7',
            '--event-text': '#F1F5F9',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.3)',
            '--selection-border': '#A6ADC8',
            // Graphs
            '--graph-line-1': '#7AA2F7',
            '--graph-line-2': '#A6ADC8',
            '--graph-bg': '#0B0D12',
            '--graph-grid': '#202534',
            '--graph-text': '#C7D0DD',
        }
    },
    {
        id: 'theme-forest',
        name: 'Emerald Forest',
        type: 'default',
        colors: {
            '--bg': '#0e1512',
            '--surface': '#14201b',
            '--text': '#e9fff1',
            '--muted': '#cfe9db',
            '--primary': '#2ecc71',
            '--primary-contrast': '#08110e',
            '--accent': '#1abc9c',
            '--border': '#1b332a',
            '--shadow': 'rgba(0, 0, 0, 0.45)',
            // Dino
            '--day': '#E8F5E9',
            '--night': '#0e1512',
            '--tree-day': '#1ABC9C',
            '--tree-night': '#08110e',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#1b332a',
            '--sun-day': '#F1C40F',
            '--sun-night': '#D35400',
            '--moon-day': '#fff',
            '--moon-night': '#CFE9DB',
            '--sky-day': '#E8F5E9',
            '--sky-night': '#0e1512',
            // Extended Text
            '--text-secondary': '#CFE9DB',
            '--text-tertiary': '#1ABC9C',
            '--text-highlight': '#2ECC71',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#E9FFF1',
            '--heading': '#2ECC71',
            '--label': '#CFE9DB',
            // Sections & Panels
            '--section-bg': '#14201B',
            '--section-border': '#1B332A',
            '--panel-bg': '#1C2C26',
            '--panel-border': '#14201B',
            '--header-bg': '#0E1512',
            '--header-text': '#2ECC71',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#2ECC71',
            '--event-text': '#E9FFF1',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.3)',
            '--selection-border': '#1ABC9C',
            // Graphs
            '--graph-line-1': '#2ECC71',
            '--graph-line-2': '#1ABC9C',
            '--graph-bg': '#0E1512',
            '--graph-grid': '#1B332A',
            '--graph-text': '#CFE9DB',
        }
    },
    {
        id: 'theme-ocean',
        name: 'Deep Ocean',
        type: 'default',
        colors: {
            '--bg': '#071a2c',
            '--surface': '#0f2e4a',
            '--text': '#e7f6ff',
            '--muted': '#b9d8ea',
            '--primary': '#23a6f2',
            '--primary-contrast': '#041019',
            '--accent': '#1f6feb',
            '--border': '#17415f',
            '--shadow': 'rgba(3, 19, 33, 0.5)',
            // Dino
            '--day': '#E0F7FA',
            '--night': '#071a2c',
            '--tree-day': '#1F6FEB',
            '--tree-night': '#0F2E4A',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#17415f',
            '--sun-day': '#FFD700',
            '--sun-night': '#FF7E5F',
            '--moon-day': '#ffffff',
            '--moon-night': '#B9D8EA',
            '--sky-day': '#B2EBF2',
            '--sky-night': '#071a2c',
            // Extended Text
            '--text-secondary': '#B9D8EA',
            '--text-tertiary': '#1F6FEB',
            '--text-highlight': '#23A6F2',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#E7F6FF',
            '--heading': '#23A6F2',
            '--label': '#B9D8EA',
            // Sections & Panels
            '--section-bg': '#0F2E4A',
            '--section-border': '#17415F',
            '--panel-bg': '#153C61',
            '--panel-border': '#0F2E4A',
            '--header-bg': '#071A2C',
            '--header-text': '#23A6F2',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#38BDF8',
            '--event-text': '#F0F9FF',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.25)',
            '--selection-border': '#1F6FEB',
            // Graphs
            '--graph-line-1': '#23A6F2',
            '--graph-line-2': '#1F6FEB',
            '--graph-bg': '#071A2C',
            '--graph-grid': '#17415F',
            '--graph-text': '#B9D8EA',
        }
    },
    {
        id: 'theme-sunset',
        name: 'Amber Dusk',
        type: 'default',
        colors: {
            '--bg': '#1e0b12',
            '--surface': '#2b0f18',
            '--text': '#fff4ee',
            '--muted': '#ffd6c8',
            '--primary': '#ff7a59',
            '--primary-contrast': '#16070b',
            '--accent': '#ffb86b',
            '--border': '#4b1a22',
            '--shadow': 'rgba(30, 11, 18, 0.5)',
            // Dino
            '--day': '#FFF5EE',
            '--night': '#1e0b12',
            '--tree-day': '#FFB86B',
            '--tree-night': '#4B1A22',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#4b1a22',
            '--sun-day': '#ffb86b',
            '--sun-night': '#8B0000',
            '--moon-day': '#fff',
            '--moon-night': '#FFD6C8',
            '--sky-day': '#FFF5EE',
            '--sky-night': '#1e0b12',
            // Extended Text
            '--text-secondary': '#FFD6C8',
            '--text-tertiary': '#FFB86B',
            '--text-highlight': '#FF7A59',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#FFF4EE',
            '--heading': '#FF7A59',
            '--label': '#FFD6C8',
            // Sections & Panels
            '--section-bg': '#2B0F18',
            '--section-border': '#4B1A22',
            '--panel-bg': '#3D1522',
            '--panel-border': '#2B0F18',
            '--header-bg': '#1E0B12',
            '--header-text': '#FF7A59',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.15)',
            '--event-border': '#F59E0B',
            '--event-text': '#FFFBEB',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.2)',
            '--selection-border': '#FFB86B',
            // Graphs
            '--graph-line-1': '#FF7A59',
            '--graph-line-2': '#FFB86B',
            '--graph-bg': '#1E0B12',
            '--graph-grid': '#4B1A22',
            '--graph-text': '#FFD6C8',
        }
    },
    {
        id: 'theme-plum',
        name: 'Mulberry Mist',
        type: 'default',
        colors: {
            '--bg': '#1A1A1D',
            '--surface': '#3B1C32',
            '--text': '#f7ecf4',
            '--muted': '#e7cfe0',
            '--primary': '#A64D79',
            '--primary-contrast': '#0e0d10',
            '--accent': '#6A1E55',
            '--border': '#4a2a40',
            '--shadow': 'rgba(0,0,0,0.55)',
            // Dino
            '--day': '#F3E5F5',
            '--night': '#1A1A1D',
            '--tree-day': '#6A1E55',
            '--tree-night': '#3B1C32',
            '--cloud-day': '#fff',
            '--cloud-night': '#4a2a40',
            '--sun-day': '#E1BEE7',
            '--sun-night': '#8E24AA',
            '--moon-day': '#fff',
            '--moon-night': '#E7CFE0',
            '--sky-day': '#F3E5F5',
            '--sky-night': '#1A1A1D',
            // Extended Text
            '--text-secondary': '#E7CFE0',
            '--text-tertiary': '#A64D79',
            '--text-highlight': '#F7ECF4',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#F7ECF4',
            '--heading': '#A64D79',
            '--label': '#E7CFE0',
            // Sections & Panels
            '--section-bg': '#3B1C32',
            '--section-border': '#4A2A40',
            '--panel-bg': '#4A233F',
            '--panel-border': '#3B1C32',
            '--header-bg': '#1A1A1D',
            '--header-text': '#A64D79',
            // Interactive/Events
            '--event-bg': 'rgba(166, 77, 121, 0.2)',
            '--event-border': '#BC6FF1',
            '--event-text': '#F7EFFF',
            '--selection-bg': 'rgba(106, 30, 85, 0.3)',
            '--selection-border': '#6A1E55',
            // Graphs
            '--graph-line-1': '#A64D79',
            '--graph-line-2': '#6A1E55',
            '--graph-bg': '#1A1A1D',
            '--graph-grid': '#4A2A40',
            '--graph-text': '#E7CFE0',
        }
    },


    {
        id: 'theme-violet',
        name: 'Royal Violet',
        type: 'default',
        colors: {
            '--bg': '#030637',
            '--surface': '#3C0753',
            '--text': '#f4f0ff',
            '--muted': '#d9c8ff',
            '--primary': '#910A67',
            '--primary-contrast': '#0b0b15',
            '--accent': '#720455',
            '--border': '#4f2a6a',
            '--shadow': 'rgba(10, 6, 55, 0.45)',
            // Dino
            '--day': '#E6E6FA',
            '--night': '#030637',
            '--tree-day': '#720455',
            '--tree-night': '#240046',
            '--cloud-day': '#ffffff',
            '--cloud-night': '#3C0753',
            '--sun-day': '#FFD700',
            '--sun-night': '#E100FF',
            '--moon-day': '#ffffff',
            '--moon-night': '#D9C8FF',
            '--sky-day': '#E6E6FA',
            '--sky-night': '#030637',
            // Extended Text
            '--text-secondary': '#D9C8FF',
            '--text-tertiary': '#910A67',
            '--text-highlight': '#F4F0FF',
            '--text-error': '#EF4444',
            '--text-success': '#10B981',
            // Typography
            '--title': '#F4F0FF',
            '--heading': '#910A67',
            '--label': '#D9C8FF',
            // Sections & Panels
            '--section-bg': '#3C0753',
            '--section-border': '#4F2A6A',
            '--panel-bg': '#4F0A6B',
            '--panel-border': '#3C0753',
            '--header-bg': '#030637',
            '--header-text': '#910A67',
            // Interactive/Events
            '--event-bg': 'rgba(var(--primary-rgb), 0.2)',
            '--event-border': '#910A67',
            '--event-text': '#F4F0FF',
            '--selection-bg': 'rgba(var(--accent-rgb), 0.3)',
            '--selection-border': '#720455',
            // Graphs
            '--graph-line-1': '#910A67',
            '--graph-line-2': '#720455',
            '--graph-bg': '#030637',
            '--graph-grid': '#4F2A6A',
            '--graph-text': '#D9C8FF',
        }
    },
    {
        id: 'theme-neurotech',
        name: 'Neurotech Neon',
        type: 'default',
        colors: {
            '--bg': '#050510',
            '--surface': '#0a0a1f',
            '--text': '#e0f2ff',
            '--muted': '#8090a0',
            '--primary': '#00f2ff',
            '--primary-contrast': '#050510',
            '--accent': '#bc00ff',
            '--border': '#1a1a3a',
            '--shadow': 'rgba(0, 242, 255, 0.2)',
            // Dino
            '--day': '#0a0a1f',
            '--night': '#050510',
            '--tree-day': '#bc00ff',
            '--tree-night': '#00f2ff',
            '--cloud-day': '#1a1a3a',
            '--cloud-night': '#0a0a1f',
            '--sun-day': '#00f2ff',
            '--sun-night': '#bc00ff',
            '--moon-day': '#ffffff',
            '--moon-night': '#e0f2ff',
            '--sky-day': '#050510',
            '--sky-night': '#050510',
            // Extended Text
            '--text-secondary': '#8090a0',
            '--text-tertiary': '#405060',
            '--text-highlight': '#00f2ff',
            '--text-error': '#ff2d55',
            '--text-success': '#00ffaa',
            // Typography
            '--title': '#00f2ff',
            '--heading': '#bc00ff',
            '--label': '#8090a0',
            // Sections & Panels
            '--section-bg': '#0a0a1f',
            '--section-border': '#1a1a3a',
            '--panel-bg': '#0f0f2d',
            '--panel-border': '#2a2a4a',
            '--header-bg': '#050510',
            '--header-text': '#00f2ff',
            // Interactive/Events
            '--event-bg': 'rgba(0, 242, 255, 0.1)',
            '--event-border': '#00f2ff',
            '--event-text': '#e0f2ff',
            '--selection-bg': 'rgba(188, 0, 255, 0.2)',
            '--selection-border': '#bc00ff',
            // Graphs
            '--graph-line-1': '#00f2ff',
            '--graph-line-2': '#bc00ff',
            '--graph-bg': '#050510',
            '--graph-grid': '#1a1a3a',
            '--graph-text': '#8090a0',
        }
    },
];

const ThemeContext = createContext(null);

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
    // Load themes from storage (combines default + user created)
    // Load themes from storage (combines default + user created)
    const [themes, setThemes] = useState(() => {
        const saved = localStorage.getItem('bci_all_themes');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Keep only custom themes from storage, use fresh defaults to ensure order updates
                const customThemes = parsed.filter(t => t.type === 'custom');
                return [...DEFAULT_THEMES, ...customThemes];
            } catch (e) {
                console.error("Failed to parse themes", e);
                return DEFAULT_THEMES;
            }
        }
        return DEFAULT_THEMES;
    });

    // Current theme ID
    const [currentThemeId, setCurrentThemeId] = useState(() => {
        const saved = localStorage.getItem('theme');
        // Note: old code used 'theme-rose' class names.
        // We can support that as an ID.
        // If the saved theme is not in our list, fallback to first one.
        return saved || DEFAULT_THEMES[0].id;
    });

    // Derived current theme object
    const currentTheme = themes.find(t => t.id === currentThemeId) || themes[0];

    useEffect(() => {
        // Save current theme selection
        localStorage.setItem('theme', currentThemeId);

        // Save all themes (data)
        localStorage.setItem('bci_all_themes', JSON.stringify(themes));

        // Apply variables to root
        const root = document.documentElement;

        // First, remove old class-based theme hooks if any remain (from old app version)
        root.className = 'root';

        // Add specific class for Tailwind specificity if needed, though variables are usually enough
        // We add 'theme-active' just in case we need a hook
        root.classList.add('theme-active');

        // Apply all CSS variables
        Object.entries(currentTheme.colors).forEach(([key, value]) => {
            root.style.setProperty(key, value);

            // If it's a hex color, also generate an RGB triplet variable for Tailwind opacity support
            if (typeof value === 'string' && value.startsWith('#')) {
                const rgb = hexToRgbTriple(value);
                if (rgb) {
                    root.style.setProperty(`${key}-rgb`, rgb);
                }
            }
        });

        // Semantic Overrides helper (dino etc) that might resort to defaults in CSS if missing
        // We just ensure our themes have them all.

    }, [currentTheme, currentThemeId, themes]);

    const addTheme = (name) => {
        const id = `theme-custom-${Date.now()}`;
        const newTheme = {
            id,
            name,
            type: 'custom',
            colors: { ...currentTheme.colors } // Clone current as base
        };
        setThemes([...themes, newTheme]);
        setCurrentThemeId(id);
        return id;
    };

    const updateTheme = (id, updates) => {
        setThemes(prev => prev.map(t => {
            if (t.id !== id) return t;
            // Merge updates
            return { ...t, ...updates };
        }));
    };

    const updateThemeColor = (id, colorKey, value) => {
        setThemes(prev => prev.map(t => {
            if (t.id !== id) return t;
            return {
                ...t,
                colors: { ...t.colors, [colorKey]: value }
            };
        }));
    };

    const removeTheme = (id) => {
        const themeToDelete = themes.find(t => t.id === id);
        if (!themeToDelete || themeToDelete.type === 'default') {
            alert('Cannot delete default themes!');
            return;
        }

        const newThemes = themes.filter(t => t.id !== id);
        setThemes(newThemes);

        if (currentThemeId === id) {
            setCurrentThemeId(newThemes[0].id);
        }
    };

    const resetThemes = () => {
        if (window.confirm('Are you sure you want to reset all themes to default? Custom themes will be lost.')) {
            setThemes(DEFAULT_THEMES);
            setCurrentThemeId(DEFAULT_THEMES[0].id);
        }
    };

    return (
        <ThemeContext.Provider value={{
            themes,
            currentTheme,
            currentThemeId,
            setTheme: setCurrentThemeId,
            addTheme,
            updateTheme,
            updateThemeColor,
            removeTheme,
            resetThemes
        }}>
            {children}
        </ThemeContext.Provider>
    );
}
