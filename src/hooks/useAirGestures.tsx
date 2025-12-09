import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gestureNavigator, GestureAction } from '@/services/gestureNavigator';
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

  const handleGesture = useCallback((action: GestureAction) => {
    if (!mountedRef.current) return;
    
    console.log('[AirGestures] Gesture:', action);
    setLastGesture(action);
    
    // Visual feedback
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
    console.log('[AirGestures] Enabling...');
    
    const success = await gestureNavigator.start(handleGesture);
    
    if (success) {
      setIsActive(true);
      setIsEnabled(true);
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'true');
      toast({
        title: "✋ Air Gestures ON",
        description: "Wave hand left/right to navigate, up/down to scroll",
      });
    } else {
      setIsEnabled(false);
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'false');
      toast({
        title: "Camera Access Failed",
        description: "Enable camera permission and try again",
        variant: "destructive",
      });
    }
    
    return success;
  }, [handleGesture]);

  const disableGestures = useCallback(() => {
    console.log('[AirGestures] Disabling...');
    gestureNavigator.stop();
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

  // Sync state
  useEffect(() => {
    const syncState = setInterval(() => {
      if (mountedRef.current) {
        setIsActive(gestureNavigator.isActive());
      }
    }, 500);
    
    return () => clearInterval(syncState);
  }, []);

  // Cleanup on unmount - ALWAYS stop camera
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      // Always cleanup on unmount
      if (gestureNavigator.isActive()) {
        console.log('[AirGestures] Cleanup on unmount');
        gestureNavigator.stop();
      }
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
