import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { gestureNavigator, GestureAction } from '@/services/gestureNavigator';
import { toast } from '@/hooks/use-toast';

const AIR_GESTURES_STORAGE_KEY = 'airGesturesEnabled';

export const useAirGestures = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AIR_GESTURES_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [isActive, setIsActive] = useState(false);

  const handleGesture = useCallback((action: GestureAction) => {
    switch (action) {
      case 'swipe_left':
        // Navigate forward/next
        window.history.forward();
        break;
      case 'swipe_right':
        // Navigate back
        navigate(-1);
        break;
      case 'swipe_up':
        // Scroll up
        window.scrollBy({ top: -200, behavior: 'smooth' });
        break;
      case 'swipe_down':
        // Scroll down
        window.scrollBy({ top: 200, behavior: 'smooth' });
        break;
      case 'tap':
        // Simulate click on focused element or center of screen
        const focusedElement = document.activeElement as HTMLElement;
        if (focusedElement && focusedElement !== document.body) {
          focusedElement.click();
        }
        break;
      default:
        break;
    }
  }, [navigate]);

  const enableGestures = useCallback(async () => {
    const success = await gestureNavigator.start(handleGesture);
    
    if (success) {
      setIsActive(true);
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'true');
      setIsEnabled(true);
      toast({
        title: "Air Gestures Enabled",
        description: "Wave your hand to navigate!",
      });
    } else {
      toast({
        title: "Failed to Enable Air Gestures",
        description: "Could not access camera for gesture detection.",
        variant: "destructive",
      });
    }
    
    return success;
  }, [handleGesture]);

  const disableGestures = useCallback(() => {
    gestureNavigator.stop();
    setIsActive(false);
    localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'false');
    setIsEnabled(false);
    toast({
      title: "Air Gestures Disabled",
      description: "Gesture navigation is now off.",
    });
  }, []);

  const toggleGestures = useCallback(async () => {
    if (isActive) {
      disableGestures();
    } else {
      await enableGestures();
    }
  }, [isActive, enableGestures, disableGestures]);

  // Cleanup on unmount or route change
  useEffect(() => {
    return () => {
      if (gestureNavigator.isActive()) {
        gestureNavigator.stop();
        setIsActive(false);
      }
    };
  }, []);

  // Auto-start if enabled in storage (only once on mount)
  useEffect(() => {
    const storedValue = localStorage.getItem(AIR_GESTURES_STORAGE_KEY);
    if (storedValue === 'true' && !gestureNavigator.isActive()) {
      enableGestures();
    }
  }, [enableGestures]);

  return {
    isEnabled,
    isActive,
    enableGestures,
    disableGestures,
    toggleGestures,
  };
};
