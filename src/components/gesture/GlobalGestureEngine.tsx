/**
 * Global Air Gesture Engine v3
 * - Correct route-based navigation
 * - Working vertical scroll
 * - Tap gesture for clicking elements
 * - Reduced sensitivity with proper thresholds & multi-frame confirmation
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { startCamera, stopCamera, forceStopAllCameras, isCameraAvailable } from '@/utils/cameraManager';
import { toast } from '@/hooks/use-toast';

const AIR_GESTURES_KEY = 'airGesturesEnabled';
const CAMERA_EXCLUSIVE_PAGES = ['/scan'];

// CORRECT route order for swipe navigation
const ROUTES = [
  "/",          // Home / Dashboard
  "/documents",
  "/scan",
  "/tasks",
  "/docvault",
  "/profile",
];

type GestureAction = 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down' | 'tap' | 'none';

interface DebugState {
  enabled: boolean;
  cameraOk: boolean;
  handDetected: boolean;
  lastGesture: string;
  currentRoute: string;
  blocked: string;
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
  
  // Multi-frame confirmation tracking
  const pendingGestureRef = useRef<{ action: GestureAction; frameCount: number }>({ action: 'none', frameCount: 0 });
  
  // Tap detection refs
  const stableFramesRef = useRef(0);
  const lastHandCenterRef = useRef<{ x: number; y: number } | null>(null);
  
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
    blocked: '',
  });

  // ============ TUNABLE SETTINGS ============
  const CANVAS_W = 320;
  const CANVAS_H = 240;
  
  // Thresholds - increased to reduce sensitivity
  const MIN_SWIPE_X = 120;  // horizontal swipe threshold
  const MIN_SWIPE_Y = 100;  // vertical swipe threshold
  const COOLDOWN_MS = 900;  // gesture cooldown
  const TAP_COOLDOWN_MS = 700;
  const MOTION_THRESHOLD = 25;
  const MIN_MOTION_PIXELS = 45;
  const MOTION_HISTORY_WINDOW_MS = 600;
  const MIN_CONFIRM_FRAMES = 3;  // multi-frame confirmation
  const SCROLL_AMOUNT = 300;
  
  // Tap detection settings
  const TAP_STABILITY_THRESHOLD = 12;
  const TAP_STABLE_FRAMES_REQUIRED = 3;

  // Update debug route
  useEffect(() => {
    setDebug(d => ({ ...d, currentRoute: location.pathname }));
  }, [location.pathname]);

  // Check cooldown
  const canFireGesture = useCallback((): boolean => {
    const now = Date.now();
    const elapsed = now - lastGestureTimeRef.current;
    if (elapsed < COOLDOWN_MS) {
      setDebug(d => ({ ...d, blocked: `COOLDOWN ${Math.ceil((COOLDOWN_MS - elapsed) / 100)}` }));
      return false;
    }
    setDebug(d => ({ ...d, blocked: '' }));
    return true;
  }, []);

  const markGestureFired = useCallback(() => {
    lastGestureTimeRef.current = Date.now();
  }, []);

  // Execute gesture action
  const executeGesture = useCallback((action: GestureAction) => {
    console.log('[GestureEngine] Executing:', action);
    setDebug(d => ({ ...d, lastGesture: action, blocked: '' }));
    markGestureFired();
    
    toast({
      title: `👋 ${action.replace(/_/g, ' ').toUpperCase()}`,
      duration: 600,
    });
    
    const currentPath = location.pathname;
    // Match exact path or "/" for home
    let currentIndex = ROUTES.indexOf(currentPath);
    // If not found but we're on "/" or "/dashboard", treat as index 0
    if (currentIndex === -1 && (currentPath === '/' || currentPath === '/dashboard')) {
      currentIndex = 0;
    }
    
    console.log('[GestureEngine] Current path:', currentPath, 'Index:', currentIndex, 'Action:', action);
    
    switch (action) {
      case 'swipe_left': {
        // Swipe left = go to PREVIOUS route (hand gesture moves left)
        if (currentIndex > 0) {
          const prevRoute = ROUTES[currentIndex - 1];
          console.log('[GestureEngine] Navigate PREV:', currentPath, '→', prevRoute);
          navigate(prevRoute);
        } else {
          console.log('[GestureEngine] Already at first route or not found');
        }
        break;
      }
      case 'swipe_right': {
        // Swipe right = go to NEXT route (hand gesture moves right)
        if (currentIndex !== -1 && currentIndex < ROUTES.length - 1) {
          const nextRoute = ROUTES[currentIndex + 1];
          console.log('[GestureEngine] Navigate NEXT:', currentPath, '→', nextRoute);
          navigate(nextRoute);
        } else {
          console.log('[GestureEngine] Already at last route or not found');
        }
        break;
      }
      case 'swipe_up': {
        // Swipe up = scroll DOWN (content moves up, show more below)
        const scrollEl = document.scrollingElement || document.documentElement;
        console.log('[GestureEngine] Scrolling DOWN by', SCROLL_AMOUNT, 'current scrollTop:', scrollEl.scrollTop);
        scrollEl.scrollBy({ top: SCROLL_AMOUNT, behavior: 'smooth' });
        break;
      }
      case 'swipe_down': {
        // Swipe down = scroll UP (content moves down, show more above)
        const scrollEl = document.scrollingElement || document.documentElement;
        console.log('[GestureEngine] Scrolling UP by', SCROLL_AMOUNT, 'current scrollTop:', scrollEl.scrollTop);
        scrollEl.scrollBy({ top: -SCROLL_AMOUNT, behavior: 'smooth' });
        break;
      }
      case 'tap': {
        // Handled separately in handleTapClick
        break;
      }
    }
  }, [navigate, location.pathname, markGestureFired]);

  // Handle tap click at coordinates
  const handleTapClick = useCallback((canvasX: number, canvasY: number) => {
    const now = Date.now();
    if (now - tapCooldownRef.current < TAP_COOLDOWN_MS) {
      return;
    }

    // Map canvas coordinates to viewport (canvas is mirrored horizontally)
    const screenX = ((CANVAS_W - canvasX) / CANVAS_W) * window.innerWidth;
    const screenY = (canvasY / CANVAS_H) * window.innerHeight;

    console.log('[GestureEngine] Tap at screen:', Math.round(screenX), Math.round(screenY));

    const el = document.elementFromPoint(screenX, screenY) as HTMLElement;
    if (el) {
      console.log('[GestureEngine] Click element:', el.tagName, el.className?.substring?.(0, 30));
      el.click();
      
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

  // Check for tap gesture (stable hand position for multiple frames)
  const checkTapGesture = useCallback((centerX: number, centerY: number) => {
    const lastCenter = lastHandCenterRef.current;
    
    if (lastCenter) {
      const dx = Math.abs(centerX - lastCenter.x);
      const dy = Math.abs(centerY - lastCenter.y);
      const movement = Math.sqrt(dx * dx + dy * dy);
      
      if (movement < TAP_STABILITY_THRESHOLD) {
        stableFramesRef.current++;
        
        if (stableFramesRef.current >= TAP_STABLE_FRAMES_REQUIRED) {
          handleTapClick(centerX, centerY);
          stableFramesRef.current = 0;
          lastHandCenterRef.current = null;
          return;
        }
      } else {
        stableFramesRef.current = 0;
      }
    }
    
    lastHandCenterRef.current = { x: centerX, y: centerY };
  }, [handleTapClick]);

  // Classify gesture from motion history
  const classifyGesture = useCallback((): GestureAction => {
    const history = motionHistoryRef.current;
    if (history.length < 4) return 'none';
    
    const first = history[0];
    const last = history[history.length - 1];
    
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dt = last.time - first.time;
    
    if (dt < 150) return 'none'; // Too fast, likely noise
    
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    
    // Check horizontal swipe (with threshold and dominance check)
    if (absX > MIN_SWIPE_X && absX > absY * 1.5) {
      // Camera is mirrored: dx < 0 in canvas = hand moved left in user's view = swipe_left
      // dx > 0 in canvas = hand moved right in user's view = swipe_right
      const gesture = dx < 0 ? 'swipe_left' : 'swipe_right';
      console.log('[GestureEngine] Horizontal detected dx:', dx, '→', gesture);
      return gesture;
    }
    
    // Check vertical swipe
    if (absY > MIN_SWIPE_Y && absY > absX * 1.5) {
      const gesture = dy > 0 ? 'swipe_down' : 'swipe_up';
      console.log('[GestureEngine] Vertical detected dy:', dy, '→', gesture);
      return gesture;
    }
    
    return 'none';
  }, []);

  // Check gesture with multi-frame confirmation
  const checkGesture = useCallback(() => {
    if (!canFireGesture()) return;
    
    const candidateAction = classifyGesture();
    
    if (candidateAction === 'none') {
      // Reset pending
      pendingGestureRef.current = { action: 'none', frameCount: 0 };
      return;
    }
    
    const pending = pendingGestureRef.current;
    
    if (pending.action === candidateAction) {
      // Same gesture detected again
      pending.frameCount++;
      
      if (pending.frameCount >= MIN_CONFIRM_FRAMES) {
        // Confirmed! Execute the gesture
        executeGesture(candidateAction);
        pendingGestureRef.current = { action: 'none', frameCount: 0 };
        motionHistoryRef.current = [];
      }
    } else {
      // Different gesture, start new confirmation
      pendingGestureRef.current = { action: candidateAction, frameCount: 1 };
    }
  }, [canFireGesture, classifyGesture, executeGesture]);

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
          // Don't reset pending gesture immediately to allow brief pauses
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
    
    // Create hidden video element
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
      pendingGestureRef.current = { action: 'none', frameCount: 0 };
      stableFramesRef.current = 0;
      lastHandCenterRef.current = null;
      
      setDebug(d => ({ ...d, cameraOk: true }));
      
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

  // Listen for toggle events
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
      if (runningRef.current) {
        console.log('[GestureEngine] Pausing for:', location.pathname);
        stopEngine();
      }
    } else if (isEnabled) {
      if (!runningRef.current) {
        startEngine();
      }
    } else {
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
        background: 'rgba(0,0,0,0.9)',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 11,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        lineHeight: 1.6,
        minWidth: 160,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 6, borderBottom: '1px solid #555', paddingBottom: 4, fontSize: 12 }}>
        ✋ Air Gestures
      </div>
      <div>Status: <span style={{ color: debug.enabled ? '#4ade80' : '#f87171' }}>
        {debug.enabled ? 'ON' : 'OFF'}
      </span></div>
      <div>Camera: <span style={{ color: debug.cameraOk ? '#4ade80' : '#f87171' }}>
        {debug.cameraOk ? 'OK' : 'OFF'}
      </span></div>
      <div>Hand: <span style={{ color: debug.handDetected ? '#4ade80' : '#94a3b8' }}>
        {debug.handDetected ? 'YES' : 'NO'}
      </span></div>
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #444' }}>
        Route: <span style={{ color: '#60a5fa' }}>{debug.currentRoute}</span>
      </div>
      <div>Last: <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>
        {debug.lastGesture}
      </span></div>
      {debug.blocked && (
        <div style={{ color: '#f97316', marginTop: 4, fontSize: 10 }}>
          ⏳ {debug.blocked}
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
        description: newValue ? 'Swipe L/R: navigate • Up/Down: scroll • Hold: tap' : undefined,
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
