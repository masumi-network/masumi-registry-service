import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useIsNarrowScreen } from '@/lib/hooks/useIsNarrowScreen';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
  shouldAnimateIcon: boolean;
  hasAnimatedNav: boolean;
  markNavAnimated: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Start expanded so the pre-rendered HTML and the first client render match;
  // the stored choice is applied after mount.
  const [collapsed, setCollapsedState] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isNarrowScreen = useIsNarrowScreen();
  const [shouldAnimateIcon, setShouldAnimateIcon] = useState(false);
  const [hasAnimatedNav, setHasAnimatedNav] = useState(false);
  const prevCollapsedRef = useRef(collapsed);
  const prevHoveredRef = useRef(isHovered);

  useEffect(() => {
    try {
      const isStoredCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
      queueMicrotask(() => setCollapsedState(isStoredCollapsed));
    } catch {
      // Storage can throw in private mode or with blocked site data.
    }
  }, []);

  // Handle icon animation when collapsing or hover ends
  useEffect(() => {
    const isCollapsing = collapsed && !prevCollapsedRef.current;
    const isHoverEnding = collapsed && !isHovered && prevHoveredRef.current;

    if (isCollapsing || isHoverEnding) {
      setShouldAnimateIcon(true);
      const timer = setTimeout(() => {
        setShouldAnimateIcon(false);
      }, 300);
      prevCollapsedRef.current = collapsed;
      prevHoveredRef.current = isHovered;
      return () => clearTimeout(timer);
    }

    prevCollapsedRef.current = collapsed;
    prevHoveredRef.current = isHovered;
  }, [collapsed, isHovered]);

  // Persist only on user action, so the post-mount restore can never be overwritten.
  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
    } catch {
      // Not persisting is fine; the choice still applies for this session.
    }
  }, []);

  const markNavAnimated = useCallback(() => {
    setHasAnimatedNav(true);
  }, []);

  const value: SidebarContextType = {
    collapsed: collapsed || isNarrowScreen,
    setCollapsed,
    isHovered: isHovered && !isNarrowScreen,
    setIsHovered,
    shouldAnimateIcon,
    hasAnimatedNav,
    markNavAnimated,
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
