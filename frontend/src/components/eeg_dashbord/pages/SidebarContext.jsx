import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const SidebarCtx = createContext({
    sidebarMode: 'main',
    setSidebarMode: () => { },
    sidebarSlot: null,
    setSidebarSlot: () => { },
    sidebarMiniSlot: null,
    setSidebarMiniSlot: () => { },
});

export const SidebarProvider = ({ children }) => {
    const [sidebarMode, setSidebarMode] = useState('main'); // 'main' | 'page'
    const [sidebarSlot, setSidebarSlot] = useState(null);
    const [sidebarMiniSlot, setSidebarMiniSlot] = useState(null);

    const stableSetSidebarMode = useCallback((mode) => {
        setSidebarMode(mode);
    }, []);

    const stableSetSidebarSlot = useCallback((slot) => {
        setSidebarSlot(slot);
    }, []);

    const stableSetSidebarMiniSlot = useCallback((slot) => {
        setSidebarMiniSlot(slot);
    }, []);

    const value = useMemo(() => ({
        sidebarMode, 
        sidebarSlot,
        sidebarMiniSlot,
        setSidebarMode: stableSetSidebarMode, 
        setSidebarSlot: stableSetSidebarSlot,
        setSidebarMiniSlot: stableSetSidebarMiniSlot,
    }), [sidebarMode, sidebarSlot, sidebarMiniSlot, stableSetSidebarMode, stableSetSidebarSlot, stableSetSidebarMiniSlot]);

    return (
        <SidebarCtx.Provider value={value}>
            {children}
        </SidebarCtx.Provider>
    );
};

export const useSidebar = () => useContext(SidebarCtx);

export default SidebarCtx;
