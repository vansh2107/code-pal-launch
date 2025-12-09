/**
 * Air Gesture Navigation Service
 * Motion-based gesture detection that works on Desktop Chrome and Mobile
 */

import { 
  stopCameraStream, 
  stopMediaStream, 
  cancelAnimationFrameSafe,
  setupVideoElement,
  requestCamera,
  getCameraConstraints,
  isCameraAvailable
} from '@/utils/cameraCleanup';

export type GestureAction = 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down' | 'tap' | 'none';

interface MotionPoint {
  x: number;
  y: number;
  time: number;
}

type GestureCallback = (action: GestureAction) => void;

class GestureNavigator {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private callback: GestureCallback | null = null;
  
  // Detection settings
  private readonly CANVAS_WIDTH = 320;
  private readonly CANVAS_HEIGHT = 240;
  private readonly SWIPE_THRESHOLD_PX = 40; // Pixels for swipe detection
  private readonly GESTURE_COOLDOWN = 600; // ms between gestures
  private readonly MOTION_THRESHOLD = 20; // Pixel difference threshold
  private readonly MIN_MOTION_PIXELS = 30; // Minimum motion pixels to register
  
  // State
  private previousFrame: ImageData | null = null;
  private motionHistory: MotionPoint[] = [];
  private lastGestureTime = 0;
  private frameCount = 0;

  async start(onGesture: GestureCallback): Promise<boolean> {
    if (this.isRunning) {
      console.log('[GestureNav] Already running');
      return true;
    }

    if (!isCameraAvailable()) {
      console.error('[GestureNav] Camera not available');
      return false;
    }
    
    this.callback = onGesture;
    
    try {
      console.log('[GestureNav] Initializing...');
      
      // Create video element with proper attributes for Chrome
      this.videoElement = document.createElement('video');
      setupVideoElement(this.videoElement);
      this.videoElement.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        pointer-events: none;
        opacity: 0;
      `;
      document.body.appendChild(this.videoElement);
      
      // Create canvas for frame processing
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = this.CANVAS_WIDTH;
      this.canvasElement.height = this.CANVAS_HEIGHT;
      this.canvasElement.style.display = 'none';
      document.body.appendChild(this.canvasElement);
      
      this.ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });
      if (!this.ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Request camera with desktop-friendly constraints
      console.log('[GestureNav] Requesting camera...');
      const constraints = getCameraConstraints('user', true);
      this.stream = await requestCamera(constraints);
      
      if (!this.stream) {
        throw new Error('Failed to get camera stream');
      }
      
      // Attach stream to video
      this.videoElement.srcObject = this.stream;
      
      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not found'));
          return;
        }
        
        const video = this.videoElement;
        
        const onCanPlay = () => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          resolve();
        };
        
        const onError = (e: Event) => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          reject(new Error('Video error: ' + (e as ErrorEvent).message));
        };
        
        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('error', onError);
        
        // Timeout fallback
        setTimeout(() => {
          video.removeEventListener('canplay', onCanPlay);
          video.removeEventListener('error', onError);
          if (video.readyState >= 2) {
            resolve();
          } else {
            reject(new Error('Video load timeout'));
          }
        }, 5000);
      });
      
      // Start playing
      await this.videoElement.play();
      console.log('[GestureNav] Video playing, dimensions:', 
        this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
      
      this.isRunning = true;
      this.frameCount = 0;
      this.motionHistory = [];
      this.previousFrame = null;
      
      // Start detection loop using requestAnimationFrame
      this.detectLoop();
      
      console.log('[GestureNav] Started successfully');
      return true;
      
    } catch (error) {
      console.error('[GestureNav] Start failed:', error);
      this.cleanup();
      return false;
    }
  }

  stop(): void {
    console.log('[GestureNav] Stopping...');
    this.isRunning = false;
    this.cleanup();
  }

  private cleanup(): void {
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrameSafe(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Stop and cleanup stream
    if (this.stream) {
      stopMediaStream(this.stream);
      this.stream = null;
    }
    
    // Cleanup video element
    if (this.videoElement) {
      stopCameraStream(this.videoElement);
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
    
    // Cleanup canvas
    if (this.canvasElement) {
      if (this.canvasElement.parentNode) {
        this.canvasElement.parentNode.removeChild(this.canvasElement);
      }
      this.canvasElement = null;
    }
    
    // Reset state
    this.ctx = null;
    this.previousFrame = null;
    this.motionHistory = [];
    this.callback = null;
    
    console.log('[GestureNav] Cleanup complete');
  }

  private detectLoop = (): void => {
    if (!this.isRunning) return;
    
    this.processFrame();
    
    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.detectLoop);
  };

  private processFrame(): void {
    if (!this.videoElement || !this.canvasElement || !this.ctx) return;
    if (this.videoElement.readyState < 2) return;
    
    this.frameCount++;
    
    // Process every 3rd frame for performance (roughly 10 FPS at 30 FPS source)
    if (this.frameCount % 3 !== 0) return;
    
    // Draw video frame to canvas (scaled down)
    this.ctx.drawImage(
      this.videoElement,
      0, 0,
      this.CANVAS_WIDTH, this.CANVAS_HEIGHT
    );
    
    // Get current frame data
    const currentFrame = this.ctx.getImageData(
      0, 0,
      this.CANVAS_WIDTH, this.CANVAS_HEIGHT
    );
    
    // Compare with previous frame
    if (this.previousFrame) {
      const motion = this.detectMotion(this.previousFrame, currentFrame);
      
      if (motion) {
        const now = Date.now();
        
        // Add to history (normalized 0-1 coordinates)
        this.motionHistory.push({
          x: motion.centerX / this.CANVAS_WIDTH,
          y: motion.centerY / this.CANVAS_HEIGHT,
          time: now,
        });
        
        // Keep only last 400ms of motion
        const cutoff = now - 400;
        this.motionHistory = this.motionHistory.filter(m => m.time > cutoff);
        
        // Try to detect gesture
        this.detectGesture();
      }
    }
    
    this.previousFrame = currentFrame;
  }

  private detectMotion(
    prev: ImageData,
    curr: ImageData
  ): { centerX: number; centerY: number; magnitude: number } | null {
    const width = prev.width;
    const height = prev.height;
    
    let totalX = 0;
    let totalY = 0;
    let motionPixels = 0;
    
    // Sample every 4th pixel for performance
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        
        // Calculate grayscale difference
        const prevGray = (prev.data[i] * 0.299 + prev.data[i + 1] * 0.587 + prev.data[i + 2] * 0.114);
        const currGray = (curr.data[i] * 0.299 + curr.data[i + 1] * 0.587 + curr.data[i + 2] * 0.114);
        
        const diff = Math.abs(currGray - prevGray);
        
        if (diff > this.MOTION_THRESHOLD) {
          motionPixels++;
          totalX += x;
          totalY += y;
        }
      }
    }
    
    // Need minimum motion to register
    if (motionPixels < this.MIN_MOTION_PIXELS) {
      return null;
    }
    
    return {
      centerX: totalX / motionPixels,
      centerY: totalY / motionPixels,
      magnitude: motionPixels,
    };
  }

  private detectGesture(): void {
    if (this.motionHistory.length < 4) return;
    
    const now = Date.now();
    
    // Check cooldown
    if (now - this.lastGestureTime < this.GESTURE_COOLDOWN) {
      return;
    }
    
    // Get first and last points
    const first = this.motionHistory[0];
    const last = this.motionHistory[this.motionHistory.length - 1];
    
    // Calculate delta in pixels (denormalize)
    const deltaX = (last.x - first.x) * this.CANVAS_WIDTH;
    const deltaY = (last.y - first.y) * this.CANVAS_HEIGHT;
    const timeDelta = last.time - first.time;
    
    // Need at least 100ms of motion
    if (timeDelta < 100) return;
    
    // Determine dominant direction
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    let action: GestureAction = 'none';
    
    if (absX > this.SWIPE_THRESHOLD_PX && absX > absY * 1.3) {
      // Horizontal swipe - camera is mirrored so invert
      action = deltaX > 0 ? 'swipe_left' : 'swipe_right';
    } else if (absY > this.SWIPE_THRESHOLD_PX && absY > absX * 1.3) {
      // Vertical swipe
      action = deltaY > 0 ? 'swipe_down' : 'swipe_up';
    }
    
    if (action !== 'none' && this.callback) {
      console.log(`[GestureNav] Gesture detected: ${action} (dx: ${deltaX.toFixed(0)}, dy: ${deltaY.toFixed(0)}, time: ${timeDelta}ms)`);
      this.callback(action);
      this.lastGestureTime = now;
      this.motionHistory = [];
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const gestureNavigator = new GestureNavigator();
