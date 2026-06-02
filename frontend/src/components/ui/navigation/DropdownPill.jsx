import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { gsap } from 'gsap';
import '../../../styles/ui/DropdownPill.css';

/**
 * DropdownPill — A pill button that opens a dropdown menu with animation.
 * Modeled after the theme-pill dropdown in PillNav.
 *
 * Props:
 *   label          – string label for the pill
 *   isActive       – whether this pill is the currently active tab
 *   baseColor      – background color of the nav bar (default '#fff')
 *   pillColor      – background color of the pill (default '#060010')
 *   pillTextColor  – text color (default inherits from pillColor contrast)
 *   hoveredTextColor – text color on hover (default baseColor)
 *   menu           – ReactNode for dropdown content
 *   menuOpen       – controlled open state
 *   onToggle       – callback when pill is clicked
 *   onClose        – callback to close from inside menu
 *   className      – extra class
 */
const DropdownPill = ({
  label,
  isActive = false,
  baseColor = '#fff',
  pillColor = '#060010',
  pillTextColor,
  hoveredTextColor,
  menu,
  menuOpen,
  onToggle,
  onClose,
  className = '',
  pillWidth,
  pillHeight = 42,
  ease = 'power3.easeOut',
}) => {
  const resolvedPillText = pillTextColor ?? baseColor;
  const resolvedHoverText = hoveredTextColor ?? pillColor;
  const [open, setOpen] = useState(false);
  const isOpen = menuOpen !== undefined ? menuOpen : open;
  const setIsOpen = onToggle || setOpen;
  const circleRef = useRef(null);
  const labelRef = useRef(null);
  const hoverLabelRef = useRef(null);
  const tlRef = useRef(null);
  const activeTweenRef = useRef(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Setup hover animation (same as Pill component)
  useEffect(() => {
    const circle = circleRef.current;
    const labelEl = labelRef.current;
    const white = hoverLabelRef.current;
    const pill = circle?.parentElement;
    if (!circle || !pill) return;

    const w = pillWidth || pill.offsetWidth;
    const h = pillHeight || pill.offsetHeight;
    const Rval = ((w * w) / 4 + h * h) / (2 * h);
    const D = Math.ceil(2 * Rval) + 2;
    const delta = Math.ceil(Rval - Math.sqrt(Math.max(0, Rval * Rval - (w * w) / 4))) + 1;
    const originY = D - delta;

    circle.style.width = `${D}px`;
    circle.style.height = `${D}px`;
    circle.style.bottom = `-${delta}px`;

    gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: `50% ${originY}px` });
    if (labelEl) gsap.set(labelEl, { y: 0 });
    if (white) gsap.set(white, { y: h + 12, opacity: 0 });

    const tl = gsap.timeline({ paused: true });
    tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease }, 0);
    if (labelEl) tl.to(labelEl, { y: -(h + 8), duration: 2, ease }, 0);
    if (white) {
      gsap.set(white, { y: Math.ceil(h + 100), opacity: 0 });
      tl.to(white, { y: 0, opacity: 1, duration: 2, ease }, 0);
    }
    tlRef.current = tl;
  }, [label, ease, pillWidth, pillHeight]);

  const handleEnter = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    activeTweenRef.current?.kill();
    activeTweenRef.current = tl.tweenTo(tl.duration(), {
      duration: 0.3, ease, overwrite: 'auto'
    });
  }, [ease]);

  const handleLeave = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    activeTweenRef.current?.kill();
    activeTweenRef.current = tl.tweenTo(0, {
      duration: 0.2, ease, overwrite: 'auto'
    });
  }, [ease]);

  // Animate menu open/close
  useEffect(() => {
    const menuEl = menuRef.current;
    if (!menuEl) return;
    if (isOpen) {
      setMenuVisible(true);
      gsap.set(menuEl, { visibility: 'visible', opacity: 0, y: -8, scaleY: 0.95 });
      gsap.to(menuEl, {
        opacity: 1, y: 0, scaleY: 1,
        duration: 0.25, ease,
        transformOrigin: 'top center',
        onComplete: () => {
          gsap.set(menuEl, { clearProps: 'transform' });
        }
      });
    } else {
      gsap.to(menuEl, {
        opacity: 0, y: -8, scaleY: 0.95,
        duration: 0.18, ease,
        transformOrigin: 'top center',
        onComplete: () => {
          gsap.set(menuEl, { visibility: 'hidden' });
          setMenuVisible(false);
        }
      });
    }
  }, [isOpen, ease]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [isOpen, setIsOpen, onClose]);

  const cssVars = {
    '--dp-base': baseColor,
    '--dp-pill-bg': pillColor,
    '--dp-pill-text': resolvedPillText,
    '--dp-hover-text': resolvedHoverText,
  };

  return (
    <div className={`dropdown-pill-container ${className}`} ref={containerRef} style={cssVars}>
      <button
        className={`dropdown-pill-trigger${isActive ? ' is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="hover-circle" aria-hidden="true" ref={circleRef} />
        <span className="label-stack">
          <span className="pill-label" ref={labelRef}>{label}</span>
          <span className="pill-label-hover" aria-hidden="true" ref={hoverLabelRef}>{label}</span>
        </span>
        <ChevronDown
          size={14}
          className="dropdown-pill-chevron"
          style={{
            position: 'relative',
            zIndex: 2,
            marginLeft: 4,
            transition: 'transform 0.25s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      <div
        className="dropdown-pill-menu"
        ref={menuRef}
        style={{ visibility: menuVisible ? 'visible' : 'hidden' }}
      >
        {menu}
      </div>
    </div>
  );
};

export default DropdownPill;
