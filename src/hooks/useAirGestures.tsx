import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gestureNavigator, GestureAction } from '@/services/gestureNavigator';
import { forceStopAllCameras } from '@/utils/globalCameraManager';
import { toast } from '@/hooks/use-toast';

const AIR_GESTURES_STORAGE_KEY = 'airGesturesEnabled';

export const useAirGestures = () => {
  const navigate = useNavigate();
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AIR_GESTURES_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [isActive, setIsActive] = useState(gestureNavigator.isActive());
  const [lastGesture, setLastGesture] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);

  const handleGesture = useCallback((action: GestureAction) => {
    if (!mountedRef.current) return;
    
    console.log('[AirGestures] Gesture:', action);
    setLastGesture(action);
    
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

  const enableGestures = useCallback(async () => {
    if (initializingRef.current) {
      console.log('[AirGestures] Already initializing...');
      return false;
    }
    
    console.log('[AirGestures] Enabling...');
    initializingRef.current = true;
    
    // Stop any existing cameras first
    forceStopAllCameras();
    
    const success = await gestureNavigator.start(handleGesture);
    
    initializingRef.current = false;
    
    if (success) {
      setIsActive(true);
      setIsEnabled(true);
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'true');
      toast({
        title: "✋ Air Gestures ON",
        description: "Wave hand left/right to navigate, up/down to scroll",
      });
    } else {
      // IMPORTANT: Do NOT change isEnabled on failure
      // User preference is preserved - they wanted it ON
      toast({
        title: "Camera Access Failed",
        description: "Enable camera permission and try again",
        variant: "destructive",
      });
    }
    
    return success;
  }, [handleGesture]);

  const disableGestures = useCallback(() => {
    console.log('[AirGestures] Disabling (user requested)...');
    gestureNavigator.stop();
    forceStopAllCameras();
    setIsActive(false);
    setIsEnabled(false);
    localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'false');
    toast({
      title: "Air Gestures OFF",
    });
  }, []);

  const toggleGestures = useCallback(async () => {
    if (gestureNavigator.isActive()) {
      disableGestures();
    } else {
      await enableGestures();
    }
  }, [enableGestures, disableGestures]);

  // Sync state with actual gesture navigator state
  useEffect(() => {
    const syncState = setInterval(() => {
      if (mountedRef.current) {
        const actualActive = gestureNavigator.isActive();
        setIsActive(actualActive);
      }
    }, 500);
    
    return () => clearInterval(syncState);
  }, []);

  // Component mount/unmount tracking
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      // Note: We do NOT stop gestures on unmount
      // The gesture service is global and persists
    };
  }, []);

  return {
    isEnabled,
    isActive,
    lastGesture,
    enableGestures,
    disableGestures,
    toggleGestures,
  };
};
