import { useEffect, useCallback, useState } from 'react';
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
  const [isActive, setIsActive] = useState(false);
  const [lastGesture, setLastGesture] = useState<string | null>(null);

  const handleGesture = useCallback((action: GestureAction) => {
    console.log('[AirGestures] Gesture received:', action);
    setLastGesture(action);
    
    // Show visual feedback
    toast({
      title: `Gesture: ${action.replace('_', ' ')}`,
      duration: 1000,
    });
    
    switch (action) {
      case 'swipe_left':
        window.history.forward();
        break;
      case 'swipe_right':
        navigate(-1);
        break;
      case 'swipe_up':
        window.scrollBy({ top: -300, behavior: 'smooth' });
        break;
      case 'swipe_down':
        window.scrollBy({ top: 300, behavior: 'smooth' });
        break;
      case 'tap':
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
    console.log('[AirGestures] Enabling gestures...');
    const success = await gestureNavigator.start(handleGesture);
    
    if (success) {
      setIsActive(true);
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'true');
      setIsEnabled(true);
      toast({
        title: "Air Gestures Enabled ✋",
        description: "Move your hand left/right/up/down in front of camera",
      });
    } else {
      localStorage.setItem(AIR_GESTURES_STORAGE_KEY, 'false');
      setIsEnabled(false);
      toast({
        title: "Failed to Enable Air Gestures",
        description: "Could not access camera. Make sure you've granted camera permission.",
        variant: "destructive",
      });
    }
    
    return success;
  }, [handleGesture]);

  const disableGestures = useCallback(() => {
    console.log('[AirGestures] Disabling gestures...');
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
    if (isActive || gestureNavigator.isActive()) {
      disableGestures();
    } else {
      await enableGestures();
    }
  }, [isActive, enableGestures, disableGestures]);

  // Sync state with actual navigator state
  useEffect(() => {
    const checkState = () => {
      const active = gestureNavigator.isActive();
      if (active !== isActive) {
        setIsActive(active);
      }
    };
    
    const interval = setInterval(checkState, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gestureNavigator.isActive()) {
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
