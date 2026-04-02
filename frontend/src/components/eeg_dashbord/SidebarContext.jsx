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

    return (
        <SidebarCtx.Provider value={{ sidebarMode, setSidebarMode, sidebarSlot, setSidebarSlot }}>
            {children}
        </SidebarCtx.Provider>
    );
};

export const useSidebar = () => useContext(SidebarCtx);

export default SidebarCtx;
