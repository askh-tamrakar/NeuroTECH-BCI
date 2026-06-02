import React from 'react';
import { Swords, Dumbbell, Activity, Volume2, Heart } from 'lucide-react';
import DropdownPill from './DropdownPill';
import '../../../styles/ui/MuscleLabNav.css';

const TAB_ICONS = {
  rps: Swords,
  meter: Dumbbell,
  waves: Activity,
  sound: Volume2,
  ecg: Heart,
};

const TAB_COLORS = {
  rps: '#ef4444',
  meter: '#a855f7',
  waves: '#3b82f6',
  sound: '#22c55e',
  ecg: '#ef4444',
};

/**
 * MuscleLabNav — A pill-style navigation bar for Muscle Lab tabs.
 * Uses DropdownPill for the tab selector with hover animation.
 */
const MuscleLabNav = ({
  tabs,
  activeTab,
  onTabChange,
  baseColor = '#fff',
  pillColor = '#060010',
  pillTextColor,
  hoveredTextColor,
}) => {
  const activeTabData = tabs.find(t => t.id === activeTab);
  const activeColor = TAB_COLORS[activeTab] || '#a855f7';

  return (
    <div className="mlab-nav">
      <div className="mlab-nav-pills">
        {tabs.map(tab => {
          const Icon = TAB_ICONS[tab.id] || tab.icon;
          const isActive = activeTab === tab.id;
          const color = TAB_COLORS[tab.id] || tab.color || '#a855f7';

          return (
            <button
              key={tab.id}
              className={`mlab-nav-pill${isActive ? ' active' : ''}`}
              style={{
                '--tab-color': color,
              }}
              onClick={() => onTabChange(tab.id)}
              title={tab.label}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active tab indicator */}
      <div className="mlab-nav-indicator" style={{ background: activeColor }}>
        <div className="mlab-nav-indicator-inner">
          {React.createElement(TAB_ICONS[activeTab] || Dumbbell, { size: 16 })}
          <span>{activeTabData?.label || 'Muscle Meter'}</span>
        </div>
      </div>
    </div>
  );
};

export default MuscleLabNav;
