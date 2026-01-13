import React, { useState, useEffect } from 'react'
import Sidebar from '../ui/Sidebar'
import LiveView from '../views/LiveView'
import { ConfigService } from '../../services/ConfigService'
import '../../styles/live/LiveDashboard.css'

export default function LiveDashboard({ wsData, wsConfig, wsEvent, sendMessage }) {
    const [config, setConfig] = useState()
    const [isPaused, setIsPaused] = useState(false)
    const [loading, setLoading] = useState(true)

    // Load config on mount
    useEffect(() => {
        ConfigService.loadConfig().then(cfg => {
            setConfig(cfg)
            setLoading(false)
        })
    }, [])

    // Sync incoming config from WebSocket
    useEffect(() => {
        if (wsConfig && JSON.stringify(wsConfig) !== JSON.stringify(config)) {
            console.log("LiveDashboard: Syncing config from WS", wsConfig);
            setConfig(wsConfig);
            localStorage.setItem('biosignals-config', JSON.stringify(wsConfig));
        }
    }, [wsConfig, config]);

    // Auto-save removed. Manual save only.
    const handleManualSave = (updatedConfig) => {
        // Use updatedConfig if provided (and not an event object), otherwise fallback to state config
        const configToSave = (updatedConfig && !updatedConfig.type) ? updatedConfig : config

        if (!configToSave) return

        // Persist locally + Backend
        ConfigService.saveConfig(configToSave)

        // Sync to Backend via WS
        if (sendMessage) {
            sendMessage({
                type: 'SAVE_CONFIG',
                config: configToSave
            })
        }
        // alert("Configuration saved and synced!")
    }

    if (loading) return <div className="loading-screen">Loading Config...</div>

    return (
        <div className="dashboard-container">
            {/* Fixed Sidebar */}
            <Sidebar
                config={config}
                setConfig={setConfig}
                isPaused={isPaused}
                setIsPaused={setIsPaused}
                onSave={handleManualSave}
                className="sidebar-fixed"
            />

            {/* Main Content Area */}
            <main className="main-content">
                {/* Header / Top Bar if needed, currently sidebar handles controls */}

                {/* LiveView Visualization */}
                <div className="live-view-wrapper">
                    <LiveView
                        wsData={wsData}
                        wsEvent={wsEvent}
                        config={config}
                        isPaused={isPaused}
                    />
                </div>
            </main>
        </div>
    )
}
