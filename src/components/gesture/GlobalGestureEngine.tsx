/**
 * Global Air Gesture Engine
 * Mounts ONCE at app root, persists across all routes.
 * Provides debug overlay and reliable gesture detection.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { startCamera, stopCamera, forceStopAllCameras, isCameraAvailable } from '@/utils/cameraManager';
import { toast } from '@/hooks/use-toast';

const AIR_GESTURES_KEY = 'airGesturesEnabled';
const CAMERA_EXCLUSIVE_PAGES = ['/scan'];

type GestureAction = 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down' | 'none';

interface DebugState {
  enabled: boolean;
  cameraOk: boolean;
  handDetected: boolean;
  lastGesture: string;
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
  const motionHistoryRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const lastGestureTimeRef = useRef(0);
  
  // State
  const [isEnabled, setIsEnabled] = useState(() => {
    return localStorage.getItem(AIR_GESTURES_KEY) === 'true';
  });
  const [debug, setDebug] = useState<DebugState>({
    enabled: false,
    cameraOk: false,
    handDetected: false,
    lastGesture: '-',
  });

  // Settings
  const CANVAS_W = 320;
  const CANVAS_H = 240;
  const SWIPE_THRESHOLD = 40;
  const COOLDOWN_MS = 600;
  const MOTION_THRESHOLD = 20;
  const MIN_MOTION_PIXELS = 30;

  // Handle gesture action
  const handleGesture = useCallback((action: GestureAction) => {
    console.log('[GestureEngine] Gesture:', action);
    setDebug(d => ({ ...d, lastGesture: action }));
    
    toast({
      title: `👋 ${action.replace(/_/g, ' ').toUpperCase()}`,
      duration: 700,
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
    }
  }, [navigate]);

  // Detect motion between frames
  const detectMotion = useCallback((prev: ImageData, curr: ImageData) => {
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

  // Detect gesture from motion history
  const checkGesture = useCallback(() => {
    const history = motionHistoryRef.current;
    if (history.length < 4) return;
    
    const now = Date.now();
    if (now - lastGestureTimeRef.current < COOLDOWN_MS) return;
    
    const first = history[0];
    const last = history[history.length - 1];
    
    const dx = (last.x - first.x);
    const dy = (last.y - first.y);
    const dt = last.time - first.time;
    
    if (dt < 100) return;
    
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    
    let action: GestureAction = 'none';
    
    if (absX > SWIPE_THRESHOLD && absX > absY * 1.3) {
      action = dx > 0 ? 'swipe_left' : 'swipe_right';
    } else if (absY > SWIPE_THRESHOLD && absY > absX * 1.3) {
      action = dy > 0 ? 'swipe_down' : 'swipe_up';
    }
    
    if (action !== 'none') {
      handleGesture(action);
      lastGestureTimeRef.current = now;
      motionHistoryRef.current = [];
    }
  }, [handleGesture]);

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
            m => m.time > now - 400
          );
          
          checkGesture();
        } else {
          setDebug(d => ({ ...d, handDetected: false }));
        }
      }
      
      previousFrameRef.current = currentFrame;
    }
    
    rafIdRef.current = requestAnimationFrame(detectionLoop);
  }, [detectMotion, checkGesture]);

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
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        padding: '6px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        lineHeight: 1.4,
      }}
    >
      <div>Air Gestures: <span style={{ color: debug.enabled ? '#4ade80' : '#f87171' }}>
        {debug.enabled ? 'ON' : 'OFF'}
      </span></div>
      <div>Camera: <span style={{ color: debug.cameraOk ? '#4ade80' : '#f87171' }}>
        {debug.cameraOk ? 'OK' : 'OFF'}
      </span></div>
      <div>Motion: <span style={{ color: debug.handDetected ? '#4ade80' : '#94a3b8' }}>
        {debug.handDetected ? 'YES' : 'NO'}
      </span></div>
      <div>Last: {debug.lastGesture}</div>
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
        description: newValue ? 'Wave left/right to navigate, up/down to scroll' : undefined,
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
