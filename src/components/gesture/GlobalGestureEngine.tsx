/**
 * Global Gesture Engine
 * Mounts ONCE at app root and persists across all routes.
 * Listens to localStorage toggle and manages gesture detection globally.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { gestureNavigator, GestureAction } from '@/services/gestureNavigator';
import { forceStopAllCameras } from '@/utils/globalCameraManager';
import { toast } from '@/hooks/use-toast';

const AIR_GESTURES_STORAGE_KEY = 'airGesturesEnabled';
const CAMERA_EXCLUSIVE_PAGES = ['/scan'];

export const GlobalGestureEngine = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AIR_GESTURES_STORAGE_KEY) === 'true';
    }
    return false;
  });

  // Handle gesture actions
  const handleGesture = useCallback((action: GestureAction) => {
    if (!mountedRef.current) return;
    
    console.log('[GlobalGesture] Gesture detected:', action);
    
    toast({
      title: `👋 ${action.replace(/_/g, ' ').toUpperCase()}`,
      duration: 800,
    });
    
    switch (action) {
      case 'swipe_left':
        window.history.forward();
        break;
      case 'swipe_right':
        navigate(-1);
        break;
      case 'swipe_up':
        window.scrollBy({ top: -250, behavior: 'smooth' });
        break;
      case 'swipe_down':
        window.scrollBy({ top: 250, behavior: 'smooth' });
        break;
      case 'tap':
        const focused = document.activeElement as HTMLElement;
        if (focused && focused !== document.body) {
          focused.click();
        }
        break;
    }
  }, [navigate]);

  // Start gesture engine
  const startGestureEngine = useCallback(async () => {
    if (initializingRef.current || gestureNavigator.isActive()) {
      return;
    }
    
    console.log('[GlobalGesture] Starting gesture engine...');
    initializingRef.current = true;
    
    // Stop any existing cameras first
    await forceStopAllCameras();
    
    const success = await gestureNavigator.start(handleGesture);
    
    initializingRef.current = false;
    
    if (success) {
      console.log('[GlobalGesture] Engine started successfully');
    } else {
      console.warn('[GlobalGesture] Failed to start engine');
    }
  }, [handleGesture]);

  // Stop gesture engine
  const stopGestureEngine = useCallback(() => {
    console.log('[GlobalGesture] Stopping gesture engine...');
    gestureNavigator.stop();
    forceStopAllCameras();
  }, []);

  // Listen for storage changes (toggle from Profile page)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === AIR_GESTURES_STORAGE_KEY) {
        const newValue = e.newValue === 'true';
        console.log('[GlobalGesture] Storage changed:', newValue);
        setIsEnabled(newValue);
      }
    };

    // Also listen for custom events (same-tab updates)
    const handleCustomToggle = (e: CustomEvent) => {
      const newValue = e.detail?.enabled ?? false;
      console.log('[GlobalGesture] Custom toggle event:', newValue);
      setIsEnabled(newValue);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('airGesturesToggle' as any, handleCustomToggle);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('airGesturesToggle' as any, handleCustomToggle);
    };
  }, []);

  // React to enabled state changes AND route changes
  useEffect(() => {
    const currentPath = location.pathname;
    const isOnCameraExclusivePage = CAMERA_EXCLUSIVE_PAGES.some(page => 
      currentPath.startsWith(page)
    );

    if (isOnCameraExclusivePage) {
      // On camera-exclusive pages, pause gesture engine
      if (gestureNavigator.isActive()) {
        console.log('[GlobalGesture] Pausing for camera-exclusive page:', currentPath);
        stopGestureEngine();
      }
    } else if (isEnabled) {
      // Not on camera-exclusive page and gestures are enabled
      if (!gestureNavigator.isActive()) {
        startGestureEngine();
      }
    } else {
      // Gestures disabled
      if (gestureNavigator.isActive()) {
        stopGestureEngine();
      }
    }
  }, [isEnabled, location.pathname, startGestureEngine, stopGestureEngine]);

  // Mount/unmount tracking
  useEffect(() => {
    mountedRef.current = true;
    
    // Check initial state on mount
    const storedValue = localStorage.getItem(AIR_GESTURES_STORAGE_KEY) === 'true';
    if (storedValue !== isEnabled) {
      setIsEnabled(storedValue);
    }
    
    return () => {
      mountedRef.current = false;
      // Clean up on app unmount
      stopGestureEngine();
    };
  }, []);

  // This component renders nothing - it's purely for logic
  return null;
};

/**
 * Helper function to toggle gestures from anywhere in the app
 * Dispatches a custom event that GlobalGestureEngine listens to
 */
export const toggleGlobalGestures = async (enable: boolean): Promise<boolean> => {
  console.log('[GlobalGesture] Toggle requested:', enable);
  
  if (enable) {
    // Stop any existing cameras first
    forceStopAllCameras();
    
    // Try to start the gesture navigator
    const success = await gestureNavigator.start(() => {});
    
    if (success) {
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'true');
      window.dispatchEvent(new CustomEvent('airGesturesToggle', { detail: { enabled: true } }));
      return true;
    } else {
      return false;
    }
  } else {
    gestureNavigator.stop();
    forceStopAllCameras();
    localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'false');
    window.dispatchEvent(new CustomEvent('airGesturesToggle', { detail: { enabled: false } }));
    return true;
  }
};

/**
 * Hook for components that just need to toggle gestures
 * Does NOT contain gesture processing logic
 */
export const useGestureToggle = () => {
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AIR_GESTURES_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [isActive, setIsActive] = useState(gestureNavigator.isActive());

  // Sync state with gesture navigator
  useEffect(() => {
    const syncState = setInterval(() => {
      setIsActive(gestureNavigator.isActive());
      const storedValue = localStorage.getItem(AIR_GESTURES_STORAGE_KEY) === 'true';
      setIsEnabled(storedValue);
    }, 500);
    
    return () => clearInterval(syncState);
  }, []);

  const toggle = useCallback(async () => {
    const newValue = !isEnabled;
    const success = await toggleGlobalGestures(newValue);
    
    if (success) {
      setIsEnabled(newValue);
      toast({
        title: newValue ? "✋ Air Gestures ON" : "Air Gestures OFF",
        description: newValue ? "Wave hand left/right to navigate, up/down to scroll" : undefined,
      });
    } else if (newValue) {
      toast({
        title: "Camera Access Failed",
        description: "Enable camera permission and try again",
        variant: "destructive",
      });
    }
    
    return success;
  }, [isEnabled]);

  return {
    isEnabled,
    isActive,
    toggle,
  };
};
