import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DataCollectionView from './DataCollectionView';
import MLTrainingView from './MLTrainingView';
import LabSwitcher from '../ui/LabSwitcher';

export default function LabView(props) {
    const [activeTab, setActiveTab] = useState('data'); // 'data' | 'ml'

    const switcher = (
        <LabSwitcher 
            activeTab={activeTab} 
            onSwitch={setActiveTab} 
        />
    );

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-bg/30">
            {/* Content Area with Transitions */}
            <div className="flex-1 relative overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="h-full w-full"
                    >
                        {activeTab === 'data' ? (
                            <DataCollectionView 
                                {...props} 
                                switcher={switcher}
                            />
                        ) : (
                            <MLTrainingView 
                                {...props} 
                                switcher={switcher}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
