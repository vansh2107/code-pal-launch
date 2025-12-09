/**
 * Air Gesture Navigation Service
 * Uses motion detection for gesture recognition
 */

import { stopCameraStream, stopMediaStream, cancelAnimationFrameSafe } from '@/utils/cameraCleanup';

export type GestureAction = 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down' | 'tap' | 'none';

interface GestureState {
  isActive: boolean;
  lastPosition: { x: number; y: number } | null;
  gestureStartTime: number;
  lastGestureTime: number;
}

type GestureCallback = (action: GestureAction) => void;

class GestureNavigator {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private callback: GestureCallback | null = null;
  private gestureState: GestureState = {
    isActive: false,
    lastPosition: null,
    gestureStartTime: 0,
    lastGestureTime: 0,
  };
  
  // Gesture detection thresholds - lowered for easier detection
  private readonly SWIPE_THRESHOLD = 0.08; // 8% of screen movement
  private readonly GESTURE_COOLDOWN = 800; // ms between gestures
  private readonly DETECTION_INTERVAL = 100; // Check every 100ms
  
  // Motion tracking
  private previousFrame: ImageData | null = null;
  private motionHistory: { x: number; y: number; time: number }[] = [];

  async start(onGesture: GestureCallback): Promise<boolean> {
    if (this.isRunning) {
      console.log('[GestureNav] Already running');
      return true;
    }
    
    this.callback = onGesture;
    
    try {
      console.log('[GestureNav] Starting gesture detection...');
      
      // Create hidden video element
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('autoplay', 'true');
      this.videoElement.setAttribute('muted', 'true');
      this.videoElement.muted = true;
      this.videoElement.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
      document.body.appendChild(this.videoElement);
      
      // Create hidden canvas for processing
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = 160;
      this.canvasElement.height = 120;
      this.canvasElement.style.display = 'none';
      document.body.appendChild(this.canvasElement);
      
      // Get camera stream
      console.log('[GestureNav] Requesting camera access...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 160 },
          height: { ideal: 120 },
          frameRate: { ideal: 10 },
        },
      });
      
      console.log('[GestureNav] Camera stream obtained');
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      
      this.isRunning = true;
      
      // Use interval for more reliable detection
      this.intervalId = setInterval(() => this.detectGestures(), this.DETECTION_INTERVAL);
      
      console.log('[GestureNav] Gesture detection started successfully');
      return true;
    } catch (error) {
      console.error('[GestureNav] Failed to start:', error);
      this.cleanup();
      return false;
    }
  }

  stop(): void {
    console.log('[GestureNav] Stopping gesture detection');
    this.isRunning = false;
    this.cleanup();
  }

  private cleanup(): void {
    // Stop interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Stop animation frame
    cancelAnimationFrameSafe(this.animationFrameId);
    this.animationFrameId = null;
    
    // Stop camera stream
    stopMediaStream(this.stream);
    this.stream = null;
    
    // Clean up video element
    if (this.videoElement) {
      stopCameraStream(this.videoElement);
      this.videoElement.remove();
      this.videoElement = null;
    }
    
    // Clean up canvas
    if (this.canvasElement) {
      this.canvasElement.remove();
      this.canvasElement = null;
    }
    
    // Reset state
    this.previousFrame = null;
    this.motionHistory = [];
    this.gestureState = {
      isActive: false,
      lastPosition: null,
      gestureStartTime: 0,
      lastGestureTime: 0,
    };
    this.callback = null;
  }

  private detectGestures(): void {
    if (!this.isRunning || !this.videoElement || !this.canvasElement) return;
    
    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;
    
    // Draw current frame
    ctx.drawImage(
      this.videoElement,
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );
    
    const currentFrame = ctx.getImageData(
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );
    
    // Detect motion
    if (this.previousFrame) {
      const motion = this.detectMotion(this.previousFrame, currentFrame);
      
      if (motion && motion.magnitude > 0.05) {
        this.motionHistory.push({
          x: motion.x,
          y: motion.y,
          time: Date.now(),
        });
        
        // Keep only last 500ms of motion
        const cutoff = Date.now() - 500;
        this.motionHistory = this.motionHistory.filter(m => m.time > cutoff);
        
        // Analyze motion pattern
        this.analyzeMotion();
      }
    }
    
    this.previousFrame = currentFrame;
  }

  private detectMotion(
    prev: ImageData,
    curr: ImageData
  ): { x: number; y: number; magnitude: number } | null {
    const width = prev.width;
    const height = prev.height;
    const threshold = 25;
    
    let totalDiffX = 0;
    let totalDiffY = 0;
    let motionPixels = 0;
    
    // Sample every 4th pixel for performance
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        
        const prevGray = (prev.data[i] + prev.data[i + 1] + prev.data[i + 2]) / 3;
        const currGray = (curr.data[i] + curr.data[i + 1] + curr.data[i + 2]) / 3;
        
        const diff = Math.abs(currGray - prevGray);
        
        if (diff > threshold) {
          motionPixels++;
          totalDiffX += x;
          totalDiffY += y;
        }
      }
    }
    
    if (motionPixels < 20) return null;
    
    // Calculate center of motion (normalized 0-1)
    const centerX = totalDiffX / motionPixels / width;
    const centerY = totalDiffY / motionPixels / height;
    const magnitude = motionPixels / ((width * height) / 16);
    
    return { x: centerX, y: centerY, magnitude };
  }

  private analyzeMotion(): void {
    if (this.motionHistory.length < 3) return;
    
    const now = Date.now();
    
    // Check cooldown
    if (now - this.gestureState.lastGestureTime < this.GESTURE_COOLDOWN) {
      return;
    }
    
    // Get first and last motion points
    const first = this.motionHistory[0];
    const last = this.motionHistory[this.motionHistory.length - 1];
    
    const deltaX = last.x - first.x;
    const deltaY = last.y - first.y;
    const timeDelta = last.time - first.time;
    
    // Need at least 150ms of motion
    if (timeDelta < 150) return;
    
    let action: GestureAction = 'none';
    
    // Determine gesture - note: camera is mirrored so left/right are swapped
    if (Math.abs(deltaX) > this.SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe - swapped because camera mirrors
      action = deltaX > 0 ? 'swipe_left' : 'swipe_right';
    } else if (Math.abs(deltaY) > this.SWIPE_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
      // Vertical swipe
      action = deltaY > 0 ? 'swipe_down' : 'swipe_up';
    }
    
    if (action !== 'none' && this.callback) {
      console.log(`[GestureNav] Detected: ${action} (deltaX: ${deltaX.toFixed(3)}, deltaY: ${deltaY.toFixed(3)})`);
      this.callback(action);
      this.gestureState.lastGestureTime = now;
      this.motionHistory = []; // Clear history after gesture
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const gestureNavigator = new GestureNavigator();
