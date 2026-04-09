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
    const [isCollapsed, setIsCollapsed] = useState(true);

    const stableSetSidebarMode = useCallback((mode) => {
        setSidebarMode(mode);
    }, []);

    const stableSetSidebarSlot = useCallback((slot) => {
        setSidebarSlot(slot);
    }, []);

    const stableSetIsCollapsed = useCallback((col) => {
        setIsCollapsed(col);
    }, []);

    const value = useMemo(() => ({
        sidebarMode,
        sidebarSlot,
        isCollapsed,
        setSidebarMode: stableSetSidebarMode,
        setSidebarSlot: stableSetSidebarSlot,
        setIsCollapsed: stableSetIsCollapsed
    }), [sidebarMode, sidebarSlot, isCollapsed, stableSetSidebarMode, stableSetSidebarSlot, stableSetIsCollapsed]);

    return (
        <SidebarCtx.Provider value={value}>
            {children}
        </SidebarCtx.Provider>
    );
};

export const useSidebar = () => useContext(SidebarCtx);

export default SidebarCtx;