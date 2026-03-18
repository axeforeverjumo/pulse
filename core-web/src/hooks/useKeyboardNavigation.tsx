import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// Zone identifiers for different navigation areas
export type NavigationZone = 'main-sidebar' | 'app-sidebar' | 'content';

interface KeyboardNavigationContextType {
  // Current active zone
  activeZone: NavigationZone;
  setActiveZone: (zone: NavigationZone) => void;

  // Zone order for left/right navigation
  zoneOrder: NavigationZone[];

  // Move to adjacent zone
  moveToNextZone: () => void;
  moveToPrevZone: () => void;

  // Check if a zone is active
  isZoneActive: (zone: NavigationZone) => boolean;
}

const KeyboardNavigationContext = createContext<KeyboardNavigationContextType | null>(null);

interface KeyboardNavigationProviderProps {
  children: React.ReactNode;
  initialZone?: NavigationZone;
}

export function KeyboardNavigationProvider({
  children,
  initialZone = 'main-sidebar'
}: KeyboardNavigationProviderProps) {
  const [activeZone, setActiveZone] = useState<NavigationZone>(initialZone);
  const zoneOrder: NavigationZone[] = ['main-sidebar', 'app-sidebar', 'content'];

  const moveToNextZone = useCallback(() => {
    setActiveZone((current) => {
      const currentIndex = zoneOrder.indexOf(current);
      const nextIndex = Math.min(currentIndex + 1, zoneOrder.length - 1);
      return zoneOrder[nextIndex];
    });
  }, [zoneOrder]);

  const moveToPrevZone = useCallback(() => {
    setActiveZone((current) => {
      const currentIndex = zoneOrder.indexOf(current);
      const prevIndex = Math.max(currentIndex - 1, 0);
      return zoneOrder[prevIndex];
    });
  }, [zoneOrder]);

  const isZoneActive = useCallback((zone: NavigationZone) => {
    return activeZone === zone;
  }, [activeZone]);

  return (
    <KeyboardNavigationContext.Provider
      value={{
        activeZone,
        setActiveZone,
        zoneOrder,
        moveToNextZone,
        moveToPrevZone,
        isZoneActive,
      }}
    >
      {children}
    </KeyboardNavigationContext.Provider>
  );
}

// Hook to access the navigation context
export function useKeyboardNavigation() {
  const context = useContext(KeyboardNavigationContext);
  if (!context) {
    throw new Error('useKeyboardNavigation must be used within a KeyboardNavigationProvider');
  }
  return context;
}

// Hook for zone-level navigation (handles left/right arrows between zones)
interface UseZoneNavigationOptions {
  zone: NavigationZone;
  onEnter?: () => void; // Called when entering this zone
  onExit?: () => void;  // Called when leaving this zone
}

export function useZoneNavigation({ zone, onEnter, onExit }: UseZoneNavigationOptions) {
  const { activeZone, setActiveZone, moveToNextZone, moveToPrevZone, isZoneActive } = useKeyboardNavigation();
  const wasActive = useRef(isZoneActive(zone));

  // Track zone enter/exit
  useEffect(() => {
    const isActive = isZoneActive(zone);
    if (isActive && !wasActive.current) {
      onEnter?.();
    } else if (!isActive && wasActive.current) {
      onExit?.();
    }
    wasActive.current = isActive;
  }, [activeZone, zone, onEnter, onExit, isZoneActive]);

  const handleZoneKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isZoneActive(zone)) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveToNextZone();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveToPrevZone();
        break;
    }
  }, [zone, isZoneActive, moveToNextZone, moveToPrevZone]);

  const activateZone = useCallback(() => {
    setActiveZone(zone);
  }, [zone, setActiveZone]);

  return {
    isActive: isZoneActive(zone),
    handleZoneKeyDown,
    activateZone,
  };
}

// Hook for list navigation within a zone (handles up/down arrows)
interface UseListNavigationOptions<T> {
  items: T[];
  zone: NavigationZone;
  onSelect?: (item: T, index: number) => void;
  onHighlight?: (item: T, index: number) => void;
  initialIndex?: number;
  loop?: boolean; // Whether to loop from end to start
}

export function useListNavigation<T>({
  items,
  zone,
  onSelect,
  onHighlight,
  initialIndex = 0,
  loop = false,
}: UseListNavigationOptions<T>) {
  const [highlightedIndex, setHighlightedIndex] = useState(initialIndex);
  const { isZoneActive, setActiveZone } = useKeyboardNavigation();
  const isActive = isZoneActive(zone);

  // Reset highlighted index when items change significantly
  useEffect(() => {
    if (highlightedIndex >= items.length) {
      setHighlightedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, highlightedIndex]);

  // Notify when highlight changes
  useEffect(() => {
    if (isActive && items[highlightedIndex]) {
      onHighlight?.(items[highlightedIndex], highlightedIndex);
    }
  }, [highlightedIndex, isActive, items, onHighlight]);

  const moveUp = useCallback(() => {
    setHighlightedIndex((current) => {
      if (current <= 0) {
        return loop ? items.length - 1 : 0;
      }
      return current - 1;
    });
  }, [items.length, loop]);

  const moveDown = useCallback(() => {
    setHighlightedIndex((current) => {
      if (current >= items.length - 1) {
        return loop ? 0 : items.length - 1;
      }
      return current + 1;
    });
  }, [items.length, loop]);

  const selectCurrent = useCallback(() => {
    if (items[highlightedIndex]) {
      onSelect?.(items[highlightedIndex], highlightedIndex);
    }
  }, [items, highlightedIndex, onSelect]);

  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isActive) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        moveUp();
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveDown();
        break;
      case 'Enter':
        e.preventDefault();
        selectCurrent();
        break;
    }
  }, [isActive, moveUp, moveDown, selectCurrent]);

  const setIndex = useCallback((index: number) => {
    if (index >= 0 && index < items.length) {
      setHighlightedIndex(index);
    }
  }, [items.length]);

  const activateAndSelect = useCallback((index: number) => {
    setActiveZone(zone);
    setIndex(index);
  }, [zone, setActiveZone, setIndex]);

  return {
    highlightedIndex,
    isActive,
    handleListKeyDown,
    moveUp,
    moveDown,
    selectCurrent,
    setIndex,
    activateAndSelect,
  };
}

// Combined hook for a navigable list within a zone
interface UseNavigableListOptions<T> {
  items: T[];
  zone: NavigationZone;
  onSelect?: (item: T, index: number) => void;
  onHighlight?: (item: T, index: number) => void;
  initialIndex?: number;
  loop?: boolean;
}

export function useNavigableList<T>(options: UseNavigableListOptions<T>) {
  const zoneNav = useZoneNavigation({ zone: options.zone });
  const listNav = useListNavigation(options);

  // Combined key handler for both zone and list navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle zone switching (left/right)
    zoneNav.handleZoneKeyDown(e);
    // Handle list navigation (up/down/enter)
    listNav.handleListKeyDown(e);
  }, [zoneNav, listNav]);

  return {
    ...listNav,
    ...zoneNav,
    handleKeyDown,
  };
}
