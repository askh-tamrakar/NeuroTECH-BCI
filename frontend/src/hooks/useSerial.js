import { useState, useEffect, useCallback } from 'react';
import { serialService } from '../services/SerialService';

export const useSerial = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [stats, setStats] = useState({ packetsReceived: 0, syncErrors: 0 });
    const [lastPacket, setLastPacket] = useState(null);

    useEffect(() => {
        const handleConnected = () => setIsConnected(true);
        const handleDisconnected = () => setIsConnected(false);
        const handleData = (packets) => {
            // Update stats sparingly to avoid re-renders? 
            // Better to pull stats on interval, but we can set last packet for liveness
            if (packets.length > 0) {
                setLastPacket(packets[packets.length - 1]);
            }
        };

        serialService.on('connected', handleConnected);
        serialService.on('disconnected', handleDisconnected);
        serialService.on('data', handleData);

        // Sync initial state
        setIsConnected(serialService.isConnected);

        // Stats Polling
        const interval = setInterval(() => {
            setStats({ ...serialService.stats });
        }, 1000);

        return () => {
            serialService.off('connected', handleConnected);
            serialService.off('disconnected', handleDisconnected);
            serialService.off('data', handleData);
            clearInterval(interval);
        };
    }, []);

    const connect = useCallback(async () => {
        try {
            const port = await serialService.requestPort();
            await serialService.connect(port);
        } catch (e) {
            console.error("Failed to connect", e);
        }
    }, []);

    const disconnect = useCallback(() => {
        serialService.disconnect();
    }, []);

    const startAcquisition = useCallback(async () => {
        await serialService.startAcquisition();
    }, []);

    const stopAcquisition = useCallback(async () => {
        await serialService.stopAcquisition();
    }, []);

    return {
        isConnected,
        connect,
        disconnect,
        startAcquisition,
        stopAcquisition,
        stats,
        lastPacket
    };
};
