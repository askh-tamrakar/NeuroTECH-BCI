import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DataCollectionView from './DataCollectionView';
import MLTrainingView from './MLTrainingView';

export default function LabView(props) {
    const [activeTab, setActiveTab] = useState('data'); // 'data' | 'ml'

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
                {activeTab === 'data' ? (
                    <DataCollectionView 
                        {...props} 
                        onSwitchLab={() => setActiveTab('ml')} 
                    />
                ) : (
                    <MLTrainingView 
                        {...props} 
                        onSwitchLab={() => setActiveTab('data')} 
                    />
                )}
            </motion.div>
        </AnimatePresence>
    );
}
