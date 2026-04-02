import React, { useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import DataCollectionView from '../lab/DataCollectionView';
import MLTrainingView from '../lab/MLTrainingView';

export default function LabView(props) {
    const navigate = useNavigate();
    const location = useLocation();

    const activeTab = useMemo(() => {
        if (location.pathname.includes('/ml_trainner')) return 'ml';
        return 'data';
    }, [location.pathname]);

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex-1 flex flex-col min-h-0 w-full"
            >
                <Routes>
                    <Route path="data_collection" element={
                        <DataCollectionView 
                            {...props} 
                            onSwitchLab={() => navigate('/dashboard/lab/ml_trainner')} 
                        />
                    } />
                    <Route path="ml_trainner" element={
                        <MLTrainingView 
                            {...props} 
                            onSwitchLab={() => navigate('/dashboard/lab/data_collection')} 
                        />
                    } />
                    <Route index element={<Navigate to="data_collection" replace />} />
                    <Route path="*" element={<Navigate to="data_collection" replace />} />
                </Routes>
            </motion.div>
        </AnimatePresence>
    );
}

