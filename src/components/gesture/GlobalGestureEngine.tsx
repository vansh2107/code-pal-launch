/**
 * Global Air Gesture Engine v2
 * - Route-based navigation across all main routes
 * - Working vertical scroll
 * - Tap gesture for clicking elements
 * - Reduced sensitivity with thresholds & multi-frame confirmation
 * - Global cooldown to prevent spam
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { startCamera, stopCamera, forceStopAllCameras, isCameraAvailable } from '@/utils/cameraManager';
import { toast } from '@/hooks/use-toast';

const AIR_GESTURES_KEY = 'airGesturesEnabled';
const CAMERA_EXCLUSIVE_PAGES = ['/scan'];

// Main navigable routes in order
const MAIN_ROUTES = [
  '/dashboard',
  '/tasks',
  '/documents',
  '/notifications',
  '/profile',
];

type GestureAction = 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down' | 'tap' | 'none';

interface DebugState {
  enabled: boolean;
  cameraOk: boolean;
  handDetected: boolean;
  lastGesture: string;
  currentRoute: string;
  cooldownActive: boolean;
}

interface MotionPoint {
  x: number;
  y: number;
  time: number;
}

export const GlobalGestureEngine = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const previousFrameRef = useRef<ImageData | null>(null);
  const motionHistoryRef = useRef<MotionPoint[]>([]);
  const lastGestureTimeRef = useRef(0);
  const tapCooldownRef = useRef(0);
  const gestureConfirmationRef = useRef<{ action: GestureAction; count: number }>({ action: 'none', count: 0 });
  
  // State
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem(AIR_GESTURES_KEY) === 'true';
  });
  const [debug, setDebug] = useState<DebugState>({
    enabled: false,
    cameraOk: false,
    handDetected: false,
    lastGesture: '-',
    currentRoute: '/',
    cooldownActive: false,
  });

  // ============ TUNABLE SETTINGS ============
  const CANVAS_W = 320;
  const CANVAS_H = 240;
  
  // Increased thresholds to reduce sensitivity
  const MIN_SWIPE_DISTANCE_X = 100; // pixels (normalized) for horizontal swipe
  const MIN_SWIPE_DISTANCE_Y = 80;  // pixels for vertical swipe
  const GESTURE_COOLDOWN_MS = 800;  // increased cooldown
  const TAP_COOLDOWN_MS = 600;      // tap-specific cooldown
  const MOTION_THRESHOLD = 25;      // pixel brightness diff
  const MIN_MOTION_PIXELS = 40;     // minimum changed pixels
  const MOTION_HISTORY_WINDOW_MS = 500;
  const MIN_GESTURE_FRAMES = 4;     // multi-frame confirmation
  const SCROLL_STEP = 350;          // pixels to scroll

  // Tap detection
  const TAP_STABILITY_THRESHOLD = 15; // max movement for stable tap
  const TAP_STABLE_FRAMES = 5;        // frames hand must be stable
  const stableFramesRef = useRef(0);
  const lastHandCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Update debug route
  useEffect(() => {
    setDebug(d => ({ ...d, currentRoute: location.pathname }));
  }, [location.pathname]);

  // Check cooldown
  const canFireGesture = useCallback(() => {
    const now = Date.now();
    const canFire = now - lastGestureTimeRef.current > GESTURE_COOLDOWN_MS;
    setDebug(d => ({ ...d, cooldownActive: !canFire }));
    return canFire;
  }, []);

  const markGestureFired = useCallback(() => {
    lastGestureTimeRef.current = Date.now();
  }, []);

  // Handle gesture action with route-based navigation
  const handleGesture = useCallback((action: GestureAction) => {
    if (!canFireGesture()) {
      console.log('[GestureEngine] Gesture blocked by cooldown:', action);
      return;
    }

    console.log('[GestureEngine] Gesture:', action);
    setDebug(d => ({ ...d, lastGesture: action }));
    markGestureFired();
    
    toast({
      title: `👋 ${action.replace(/_/g, ' ').toUpperCase()}`,
      duration: 700,
    });
    
    switch (action) {
      case 'swipe_left': {
        // Navigate to next route in array
        const currentIndex = MAIN_ROUTES.indexOf(location.pathname);
        if (currentIndex !== -1 && currentIndex < MAIN_ROUTES.length - 1) {
          const nextRoute = MAIN_ROUTES[currentIndex + 1];
          console.log('[GestureEngine] Navigate to:', nextRoute);
          navigate(nextRoute);
        } else if (currentIndex === -1) {
          // Not on a main route, go to first
          navigate(MAIN_ROUTES[0]);
        }
        break;
      }
      case 'swipe_right': {
        // Navigate to previous route in array
        const currentIndex = MAIN_ROUTES.indexOf(location.pathname);
        if (currentIndex > 0) {
          const prevRoute = MAIN_ROUTES[currentIndex - 1];
          console.log('[GestureEngine] Navigate to:', prevRoute);
          navigate(prevRoute);
        } else if (currentIndex === -1) {
          // Not on a main route, use browser back
          navigate(-1);
        }
        break;
      }
      case 'swipe_up': {
        // Swipe up = scroll down (hand moves up, page content moves up)
        const scrollEl = document.scrollingElement || document.documentElement;
        scrollEl.scrollBy({ top: SCROLL_STEP, behavior: 'smooth' });
        break;
      }
      case 'swipe_down': {
        // Swipe down = scroll up
        const scrollEl = document.scrollingElement || document.documentElement;
        scrollEl.scrollBy({ top: -SCROLL_STEP, behavior: 'smooth' });
        break;
      }
      case 'tap': {
        // Already handled in tap detection
        break;
      }
    }
  }, [navigate, location.pathname, canFireGesture, markGestureFired]);

  // Handle tap click at coordinates
  const handleTapClick = useCallback((canvasX: number, canvasY: number) => {
    const now = Date.now();
    if (now - tapCooldownRef.current < TAP_COOLDOWN_MS) {
      console.log('[GestureEngine] Tap blocked by cooldown');
      return;
    }

    // Map canvas coordinates to viewport
    // Canvas is mirrored (camera view), so we need to flip X
    const viewportX = ((CANVAS_W - canvasX) / CANVAS_W) * window.innerWidth;
    const viewportY = (canvasY / CANVAS_H) * window.innerHeight;

    console.log('[GestureEngine] Tap at viewport:', viewportX, viewportY);

    const element = document.elementFromPoint(viewportX, viewportY) as HTMLElement;
    if (element) {
      console.log('[GestureEngine] Clicking element:', element.tagName, element.className);
      element.click();
      
      tapCooldownRef.current = now;
      setDebug(d => ({ ...d, lastGesture: 'tap' }));
      
      toast({
        title: `👆 TAP`,
        duration: 500,
      });
    }
  }, []);

  // Detect motion between frames
  const detectMotion = useCallback((prev: ImageData, curr: ImageData): { x: number; y: number; count: number } | null => {
    let totalX = 0, totalY = 0, count = 0;
    
    for (let y = 0; y < CANVAS_H; y += 4) {
      for (let x = 0; x < CANVAS_W; x += 4) {
        const i = (y * CANVAS_W + x) * 4;
        const prevGray = prev.data[i] * 0.299 + prev.data[i + 1] * 0.587 + prev.data[i + 2] * 0.114;
        const currGray = curr.data[i] * 0.299 + curr.data[i + 1] * 0.587 + curr.data[i + 2] * 0.114;
        
        if (Math.abs(currGray - prevGray) > MOTION_THRESHOLD) {
          count++;
          totalX += x;
          totalY += y;
        }
      }
    }
    
    if (count >= MIN_MOTION_PIXELS) {
      return { x: totalX / count, y: totalY / count, count };
    }
    return null;
  }, []);

  // Check for tap gesture (stable hand position)
  const checkTapGesture = useCallback((centerX: number, centerY: number) => {
    const lastCenter = lastHandCenterRef.current;
    
    if (lastCenter) {
      const dx = Math.abs(centerX - lastCenter.x);
      const dy = Math.abs(centerY - lastCenter.y);
      const movement = Math.sqrt(dx * dx + dy * dy);
      
      if (movement < TAP_STABILITY_THRESHOLD) {
        stableFramesRef.current++;
        
        if (stableFramesRef.current >= TAP_STABLE_FRAMES) {
          // Stable enough for tap
          handleTapClick(centerX, centerY);
          stableFramesRef.current = 0;
        }
      } else {
        stableFramesRef.current = 0;
      }
    }
    
    lastHandCenterRef.current = { x: centerX, y: centerY };
  }, [handleTapClick]);

  // Detect gesture from motion history with multi-frame confirmation
  const checkGesture = useCallback(() => {
    const history = motionHistoryRef.current;
    if (history.length < MIN_GESTURE_FRAMES) return;
    
    if (!canFireGesture()) return;
    
    const first = history[0];
    const last = history[history.length - 1];
    
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dt = last.time - first.time;
    
    if (dt < 150) return; // Need enough time for intentional gesture
    
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    
    let candidateAction: GestureAction = 'none';
    
    // Check thresholds
    if (absX > MIN_SWIPE_DISTANCE_X && absX > absY * 1.5) {
      // Horizontal swipe - note: camera is mirrored
      candidateAction = dx > 0 ? 'swipe_right' : 'swipe_left';
    } else if (absY > MIN_SWIPE_DISTANCE_Y && absY > absX * 1.5) {
      // Vertical swipe
      candidateAction = dy > 0 ? 'swipe_down' : 'swipe_up';
    }
    
    if (candidateAction !== 'none') {
      // Multi-frame confirmation
      const confirmation = gestureConfirmationRef.current;
      
      if (confirmation.action === candidateAction) {
        confirmation.count++;
        
        if (confirmation.count >= 2) {
          // Confirmed gesture
          handleGesture(candidateAction);
          gestureConfirmationRef.current = { action: 'none', count: 0 };
          motionHistoryRef.current = [];
        }
      } else {
        // New candidate
        gestureConfirmationRef.current = { action: candidateAction, count: 1 };
      }
    } else {
      // Reset confirmation
      gestureConfirmationRef.current = { action: 'none', count: 0 };
    }
  }, [handleGesture, canFireGesture]);

  // Main detection loop
  const detectionLoop = useCallback(() => {
    if (!runningRef.current) return;
    
    const video = videoRef.current;
    const ctx = ctxRef.current;
    
    if (video && ctx && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
      const currentFrame = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
      
      if (previousFrameRef.current) {
        const motion = detectMotion(previousFrameRef.current, currentFrame);
        
        if (motion) {
          setDebug(d => ({ ...d, handDetected: true }));
          const now = Date.now();
          
          motionHistoryRef.current.push({
            x: motion.x,
            y: motion.y,
            time: now,
          });
          
          // Keep last 400ms
          motionHistoryRef.current = motionHistoryRef.current.filter(
            m => m.time > now - MOTION_HISTORY_WINDOW_MS
          );
          
          // Check for swipe gestures
          checkGesture();
          
          // Check for tap gesture
          checkTapGesture(motion.x, motion.y);
        } else {
          setDebug(d => ({ ...d, handDetected: false }));
          stableFramesRef.current = 0;
          lastHandCenterRef.current = null;
        }
      }
      
      previousFrameRef.current = currentFrame;
    }
    
    rafIdRef.current = requestAnimationFrame(detectionLoop);
  }, [detectMotion, checkGesture, checkTapGesture]);

  // Start gesture engine
  const startEngine = useCallback(async () => {
    if (runningRef.current) return;
    
    console.log('[GestureEngine] Starting...');
    
    if (!isCameraAvailable()) {
      console.error('[GestureEngine] Camera not available');
      setDebug(d => ({ ...d, cameraOk: false }));
      return;
    }
    
    // Create video element (hidden)
    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    videoRef.current = video;
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    canvasRef.current = canvas;
    ctxRef.current = canvas.getContext('2d', { willReadFrequently: true });
    
    try {
      await startCamera(video);
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (video.readyState >= 2) resolve();
          else reject(new Error('Video timeout'));
        }, 5000);
        
        video.oncanplay = () => {
          clearTimeout(timeout);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Video error'));
        };
      });
      
      await video.play();
      
      runningRef.current = true;
      previousFrameRef.current = null;
      motionHistoryRef.current = [];
      gestureConfirmationRef.current = { action: 'none', count: 0 };
      stableFramesRef.current = 0;
      lastHandCenterRef.current = null;
      
      setDebug(d => ({ ...d, cameraOk: true }));
      
      // Start loop
      rafIdRef.current = requestAnimationFrame(detectionLoop);
      
      console.log('[GestureEngine] Started successfully');
      
    } catch (error) {
      console.error('[GestureEngine] Start failed:', error);
      setDebug(d => ({ ...d, cameraOk: false }));
      stopEngine();
    }
  }, [detectionLoop]);

  // Stop gesture engine
  const stopEngine = useCallback(() => {
    console.log('[GestureEngine] Stopping...');
    runningRef.current = false;
    
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    stopCamera(videoRef.current);
    
    if (videoRef.current?.parentNode) {
      videoRef.current.parentNode.removeChild(videoRef.current);
    }
    videoRef.current = null;
    
    if (canvasRef.current?.parentNode) {
      canvasRef.current.parentNode.removeChild(canvasRef.current);
    }
    canvasRef.current = null;
    ctxRef.current = null;
    
    previousFrameRef.current = null;
    motionHistoryRef.current = [];
    
    setDebug(d => ({ ...d, cameraOk: false, handDetected: false }));
    console.log('[GestureEngine] Stopped');
  }, []);

  // Listen for toggle events from Profile page
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === AIR_GESTURES_KEY) {
        const newVal = e.newValue === 'true';
        console.log('[GestureEngine] Storage changed:', newVal);
        setIsEnabled(newVal);
      }
    };
    
    const handleCustomToggle = (e: CustomEvent) => {
      const newVal = e.detail?.enabled ?? false;
      console.log('[GestureEngine] Custom toggle:', newVal);
      setIsEnabled(newVal);
    };
    
    window.addEventListener('storage', handleStorage);
    window.addEventListener('airGesturesToggle' as any, handleCustomToggle);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('airGesturesToggle' as any, handleCustomToggle);
    };
  }, []);

  // React to enabled state and route changes
  useEffect(() => {
    const isOnExclusivePage = CAMERA_EXCLUSIVE_PAGES.some(p => 
      location.pathname.startsWith(p)
    );
    
    setDebug(d => ({ ...d, enabled: isEnabled }));
    
    if (isOnExclusivePage) {
      // Pause for camera-exclusive pages like /scan
      if (runningRef.current) {
        console.log('[GestureEngine] Pausing for:', location.pathname);
        stopEngine();
      }
    } else if (isEnabled) {
      // Start if enabled and not on exclusive page
      if (!runningRef.current) {
        startEngine();
      }
    } else {
      // Disabled by user
      if (runningRef.current) {
        stopEngine();
      }
    }
  }, [isEnabled, location.pathname, startEngine, stopEngine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEngine();
    };
  }, [stopEngine]);

  // Debug overlay
  if (!isEnabled) return null;
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 11,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        lineHeight: 1.5,
        minWidth: 140,
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4, borderBottom: '1px solid #444', paddingBottom: 4 }}>
        ✋ Air Gestures
      </div>
      <div>Status: <span style={{ color: debug.enabled ? '#4ade80' : '#f87171' }}>
        {debug.enabled ? 'ON' : 'OFF'}
      </span></div>
      <div>Camera: <span style={{ color: debug.cameraOk ? '#4ade80' : '#f87171' }}>
        {debug.cameraOk ? 'OK' : 'OFF'}
      </span></div>
      <div>Motion: <span style={{ color: debug.handDetected ? '#4ade80' : '#94a3b8' }}>
        {debug.handDetected ? 'DETECTED' : 'NONE'}
      </span></div>
      <div>Route: <span style={{ color: '#60a5fa' }}>
        {debug.currentRoute}
      </span></div>
      <div>Last: <span style={{ color: '#fbbf24' }}>
        {debug.lastGesture}
      </span></div>
      {debug.cooldownActive && (
        <div style={{ color: '#f97316', marginTop: 2 }}>
          ⏳ COOLDOWN
        </div>
      )}
    </div>
  );
};

/**
 * Toggle Air Gestures from anywhere in the app
 */
export const toggleGlobalGestures = async (enable: boolean): Promise<boolean> => {
  console.log('[GestureEngine] Toggle requested:', enable);
  
  if (enable) {
    if (!isCameraAvailable()) {
      console.error('[GestureEngine] Camera not available');
      return false;
    }
    
    forceStopAllCameras();
    
    // Just enable the flag - the engine will start via useEffect
    localStorage.setItem(AIR_GESTURES_KEY, 'true');
    window.dispatchEvent(new CustomEvent('airGesturesToggle', { detail: { enabled: true } }));
    return true;
  } else {
    forceStopAllCameras();
    localStorage.setItem(AIR_GESTURES_KEY, 'false');
    window.dispatchEvent(new CustomEvent('airGesturesToggle', { detail: { enabled: false } }));
    return true;
  }
};

/**
 * Hook for toggling gestures from UI components
 */
export const useGestureToggle = () => {
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem(AIR_GESTURES_KEY) === 'true';
  });
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const stored = localStorage.getItem(AIR_GESTURES_KEY) === 'true';
      setIsEnabled(stored);
      // Check if running by looking for our hidden video
      const videos = document.querySelectorAll('video[style*="-9999px"]');
      setIsActive(stored && videos.length > 0);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  const toggle = useCallback(async () => {
    const newValue = !isEnabled;
    const success = await toggleGlobalGestures(newValue);
    
    if (success) {
      setIsEnabled(newValue);
      toast({
        title: newValue ? '✋ Air Gestures ON' : 'Air Gestures OFF',
        description: newValue ? 'Swipe left/right to navigate routes, up/down to scroll, hold steady to tap' : undefined,
      });
    } else if (newValue) {
      toast({
        title: 'Camera Access Failed',
        description: 'Enable camera permission and try again',
        variant: 'destructive',
      });
    }
    
    return success;
  }, [isEnabled]);

  return { isEnabled, isActive, toggle };
};
