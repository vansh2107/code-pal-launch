/**
 * Air Gesture Navigation Service
 * Motion-based gesture detection that works on Desktop Chrome and Mobile
 * 
 * CRITICAL: This service NEVER auto-disables itself on errors.
 * It only stops when user explicitly toggles it OFF.
 */

import { 
  forceStopAllCameras,
  registerAnimationFrame,
  unregisterAnimationFrame
} from '@/utils/globalCameraManager';

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
  private retryCount = 0;
  private maxRetries = 3;
  
  // Detection settings
  private readonly CANVAS_WIDTH = 320;
  private readonly CANVAS_HEIGHT = 240;
  private readonly SWIPE_THRESHOLD_PX = 40;
  private readonly GESTURE_COOLDOWN = 600;
  private readonly MOTION_THRESHOLD = 20;
  private readonly MIN_MOTION_PIXELS = 30;
  
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

    // Check camera availability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[GestureNav] Camera not available');
      return false;
    }
    
    this.callback = onGesture;
    this.retryCount = 0;
    
    return await this.initializeCamera();
  }

  private async initializeCamera(): Promise<boolean> {
    try {
      console.log('[GestureNav] Initializing camera...');
      
      // Stop any existing cameras first
      forceStopAllCameras();
      
      // Create video element
      this.videoElement = document.createElement('video');
      this.videoElement.muted = true;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.setAttribute('muted', 'true');
      this.videoElement.setAttribute('autoplay', 'true');
      this.videoElement.setAttribute('playsinline', 'true');
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
      
      // Create canvas
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = this.CANVAS_WIDTH;
      this.canvasElement.height = this.CANVAS_HEIGHT;
      this.canvasElement.style.display = 'none';
      document.body.appendChild(this.canvasElement);
      
      this.ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });
      if (!this.ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Request camera
      console.log('[GestureNav] Requesting camera stream...');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 15, max: 30 }
        },
        audio: false
      });
      
      if (!this.stream) {
        throw new Error('Failed to get camera stream');
      }
      
      // Attach stream
      this.videoElement.srcObject = this.stream;
      
      // Wait for video ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not found'));
          return;
        }
        
        const video = this.videoElement;
        const timeout = setTimeout(() => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            reject(new Error('Video load timeout'));
          }
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
      
      await this.videoElement.play();
      console.log('[GestureNav] Video playing');
      
      this.isRunning = true;
      this.frameCount = 0;
      this.motionHistory = [];
      this.previousFrame = null;
      
      // Start detection loop
      this.detectLoop();
      
      console.log('[GestureNav] Started successfully');
      return true;
      
    } catch (error) {
      console.error('[GestureNav] Camera init failed:', error);
      this.cleanupElements();
      return false;
    }
  }

  stop(): void {
    console.log('[GestureNav] Stopping (user requested)...');
    this.isRunning = false;
    this.cleanup();
  }

  private cleanupElements(): void {
    // Remove video element
    if (this.videoElement) {
      if (this.videoElement.srcObject) {
        const stream = this.videoElement.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        this.videoElement.srcObject = null;
      }
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }
    
    // Remove canvas element
    if (this.canvasElement) {
      if (this.canvasElement.parentNode) {
        this.canvasElement.parentNode.removeChild(this.canvasElement);
      }
      this.canvasElement = null;
    }
    
    // Stop stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.ctx = null;
  }

  private cleanup(): void {
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      unregisterAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.cleanupElements();
    
    // Reset state
    this.previousFrame = null;
    this.motionHistory = [];
    this.callback = null;
    
    console.log('[GestureNav] Cleanup complete');
  }

  /**
   * CRITICAL: Gesture loop that NEVER stops on errors
   * Only stops when isRunning is false (user disabled)
   */
  private detectLoop = (): void => {
    // Only exit if user explicitly stopped
    if (!this.isRunning) {
      return;
    }
    
    // Process frame with error handling
    try {
      this.processFrame();
    } catch (err) {
      // Log error but NEVER stop the loop
      console.error('[GestureNav] Frame processing error (continuing):', err);
    }
    
    // ALWAYS continue the loop while running
    this.animationFrameId = requestAnimationFrame(this.detectLoop);
    registerAnimationFrame(this.animationFrameId);
  };

  private processFrame(): void {
    // Guard against null refs but don't crash
    if (!this.videoElement || !this.canvasElement || !this.ctx) {
      return;
    }
    
    if (this.videoElement.readyState < 2) {
      return;
    }
    
    this.frameCount++;
    
    // Process every 3rd frame for performance
    if (this.frameCount % 3 !== 0) return;
    
    // Draw video frame to canvas
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
        
        this.motionHistory.push({
          x: motion.centerX / this.CANVAS_WIDTH,
          y: motion.centerY / this.CANVAS_HEIGHT,
          time: now,
        });
        
        // Keep only last 400ms
        const cutoff = now - 400;
        this.motionHistory = this.motionHistory.filter(m => m.time > cutoff);
        
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
    
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        
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
    
    if (now - this.lastGestureTime < this.GESTURE_COOLDOWN) {
      return;
    }
    
    const first = this.motionHistory[0];
    const last = this.motionHistory[this.motionHistory.length - 1];
    
    const deltaX = (last.x - first.x) * this.CANVAS_WIDTH;
    const deltaY = (last.y - first.y) * this.CANVAS_HEIGHT;
    const timeDelta = last.time - first.time;
    
    if (timeDelta < 100) return;
    
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    let action: GestureAction = 'none';
    
    // Fix: Webcam is mirrored, so positive deltaX = hand moved RIGHT = swipe_right
    // Positive deltaY = hand moved DOWN = swipe_down
    if (absX > this.SWIPE_THRESHOLD_PX && absX > absY * 1.3) {
      action = deltaX > 0 ? 'swipe_right' : 'swipe_left';
    } else if (absY > this.SWIPE_THRESHOLD_PX && absY > absX * 1.3) {
      action = deltaY > 0 ? 'swipe_down' : 'swipe_up';
    }
    
    if (action !== 'none' && this.callback) {
      console.log(`[GestureNav] Gesture: ${action}`);
      try {
        this.callback(action);
      } catch (err) {
        console.error('[GestureNav] Callback error:', err);
      }
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
