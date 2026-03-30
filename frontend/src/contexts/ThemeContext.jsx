import React, { createContext, useContext, useState, useEffect } from 'react';

// Ported from index.css
const hexToRgbTriple = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return isNaN(r) ? null : `${r}, ${g}, ${b}`;
};

const themeFiles = import.meta.glob('../themes/*.json', { eager: true, import: 'default' });
const loadedThemes = Object.values(themeFiles);

// Assign a default order and visible true based on index
const DEFAULT_THEMES = loadedThemes.map((t, index) => ({
    ...t,
    order: t.order ?? (index * 10),
    visible: t.visible ?? true
}));

const ThemeContext = createContext(null);

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
    const [themes, setThemes] = useState(() => {
        const saved = localStorage.getItem('bci_all_themes');
        const savedOverrides = localStorage.getItem('bci_theme_overrides');
        let currentDefaults = [...DEFAULT_THEMES];

        if (savedOverrides) {
             try {
                const overrides = JSON.parse(savedOverrides);
                currentDefaults = currentDefaults.map(t => {
                   if (overrides[t.id]) {
                      return { ...t, order: overrides[t.id].order ?? t.order, visible: overrides[t.id].visible ?? t.visible };
                   }
                   return t;
                });
             } catch (e) {
                console.error("Failed to parse overrides", e);
             }
        }

        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Keep only custom themes from storage, use fresh defaults to ensure order updates
                const customThemes = parsed.filter(t => t.type === 'custom');
                return [...currentDefaults, ...customThemes].sort((a,b) => a.order - b.order);
            } catch (e) {
                console.error("Failed to parse themes", e);
                return currentDefaults.sort((a,b) => a.order - b.order);
            }
        }
        return currentDefaults.sort((a,b) => a.order - b.order);
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

        // Save only custom themes to prevent modifications to defaults from persisting
        const customThemesOnly = themes.filter(t => t.type === 'custom');
        localStorage.setItem('bci_all_themes', JSON.stringify(customThemesOnly));

        // Save order/visible overrides for default themes
        const defaultThemeOverrides = {};
        themes.filter(t => t.type === 'default').forEach(t => {
            defaultThemeOverrides[t.id] = { order: t.order, visible: t.visible };
        });
        localStorage.setItem('bci_theme_overrides', JSON.stringify(defaultThemeOverrides));

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
            accent: currentTheme.accent,
            navBase: currentTheme.navBase,
            navPill: currentTheme.navPill,
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
        if (window.confirm('Are you sure you want to reset all themes to default? Custom themes will be lost, and organization will be reset.')) {
            localStorage.removeItem('bci_theme_overrides');
            setThemes(DEFAULT_THEMES);
            setCurrentThemeId(DEFAULT_THEMES[0].id);
        }
    };

    const reorderThemes = (newOrderedThemes) => {
        setThemes(prev => {
            const next = [...prev];
            // newOrderedThemes is typically the new array from drag-and-drop
            next.forEach(t => {
                const newIndex = newOrderedThemes.findIndex(nt => nt.id === t.id);
                if (newIndex !== -1) {
                    t.order = newIndex * 10;
                }
            });
            return next.sort((a,b) => a.order - b.order);
        });
    };

    const toggleThemeVisibility = (id) => {
        setThemes(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
    };

    const updateThemeOrder = (id, newOrder) => {
        setThemes(prev => {
            const next = prev.map(t => t.id === id ? { ...t, order: newOrder } : t);
            return next.sort((a,b) => a.order - b.order);
        });
    };

    const resetThemeColors = (id) => {
        const original = DEFAULT_THEMES.find(t => t.id === id);
        if (!original) return;
        setThemes(prev => prev.map(t => {
            if (t.id !== id) return t;
            return { ...t, colors: { ...original.colors } };
        }));
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
            resetThemes,
            resetThemeColors,
            reorderThemes,
            toggleThemeVisibility,
            updateThemeOrder
        }}>
            {children}
        </ThemeContext.Provider>
    );
}
