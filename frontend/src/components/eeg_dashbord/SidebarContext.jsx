import React, { createContext, useContext, useState } from 'react';

const SidebarCtx = createContext({
    sidebarMode: 'main',
    setSidebarMode: () => { },
    sidebarSlot: null,
    setSidebarSlot: () => { },
});

export const SidebarProvider = ({ children }) => {
    const [sidebarMode, setSidebarMode] = useState('main'); // 'main' | 'page'
    const [sidebarSlot, setSidebarSlot] = useState(null);

    const value = React.useMemo(() => ({
        sidebarMode, setSidebarMode, sidebarSlot, setSidebarSlot
    }), [sidebarMode, sidebarSlot]);

    return (
        <SidebarCtx.Provider value={value}>
            {children}
        </SidebarCtx.Provider>
    );
};

export const useSidebar = () => useContext(SidebarCtx);

export default SidebarCtx;
