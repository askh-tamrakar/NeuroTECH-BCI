import React, { createContext, useContext, useState } from 'react';

const SidebarCtx = createContext({
    sidebarMode: 'main',
    setSidebarMode: () => { },
});

export const SidebarProvider = ({ children }) => {
    const [sidebarMode, setSidebarMode] = useState('main'); // 'main' | 'page'
    return (
        <SidebarCtx.Provider value={{ sidebarMode, setSidebarMode }}>
            {children}
        </SidebarCtx.Provider>
    );
};

export const useSidebar = () => useContext(SidebarCtx);

export default SidebarCtx;
