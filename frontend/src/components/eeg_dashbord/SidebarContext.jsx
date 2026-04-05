import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const SidebarCtx = createContext({
    sidebarMode: 'main',
    setSidebarMode: () => { },
    sidebarSlot: null,
    setSidebarSlot: () => { },
});

export const SidebarProvider = ({ children }) => {
    const [sidebarMode, setSidebarMode] = useState('main'); // 'main' | 'page'
    const [sidebarSlot, setSidebarSlot] = useState(null);

    const stableSetSidebarMode = useCallback((mode) => {
        setSidebarMode(mode);
    }, []);

    const stableSetSidebarSlot = useCallback((slot) => {
        setSidebarSlot(slot);
    }, []);

    const value = useMemo(() => ({
        sidebarMode, 
        sidebarSlot,
        setSidebarMode: stableSetSidebarMode, 
        setSidebarSlot: stableSetSidebarSlot
    }), [sidebarMode, sidebarSlot, stableSetSidebarMode, stableSetSidebarSlot]);

    return (
        <SidebarCtx.Provider value={value}>
            {children}
        </SidebarCtx.Provider>
    );
};

export const useSidebar = () => useContext(SidebarCtx);

export default SidebarCtx;
