/**
 * Air Gesture Navigation Service
 * Uses MediaPipe Hands for gesture detection
 */

import { stopCameraStream, stopMediaStream, cancelAnimationFrameSafe } from '@/utils/cameraCleanup';

export type GestureAction = 'swipe_left' | 'swipe_right' | 'swipe_up' | 'swipe_down' | 'tap' | 'none';

interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

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
  private isRunning = false;
  private callback: GestureCallback | null = null;
  private gestureState: GestureState = {
    isActive: false,
    lastPosition: null,
    gestureStartTime: 0,
    lastGestureTime: 0,
  };
  
  // Gesture detection thresholds
  private readonly SWIPE_THRESHOLD = 0.15; // 15% of screen
  private readonly GESTURE_COOLDOWN = 500; // ms between gestures
  private readonly TAP_THRESHOLD = 0.02; // Small movement = tap
  private readonly DETECTION_FPS = 12; // Target FPS for detection
  
  // Simple hand detection using color/motion (lightweight alternative to MediaPipe)
  private previousFrame: ImageData | null = null;

  async start(onGesture: GestureCallback): Promise<boolean> {
    if (this.isRunning) return true;
    
    this.callback = onGesture;
    
    try {
      // Create hidden video element
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('autoplay', 'true');
      this.videoElement.style.display = 'none';
      document.body.appendChild(this.videoElement);
      
      // Create hidden canvas for processing
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = 320;
      this.canvasElement.height = 240;
      this.canvasElement.style.display = 'none';
      document.body.appendChild(this.canvasElement);
      
      // Get camera stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: this.DETECTION_FPS },
        },
      });
      
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      
      this.isRunning = true;
      this.detectGestures();
      
      return true;
    } catch (error) {
      console.error('Failed to start gesture navigator:', error);
      this.cleanup();
      return false;
    }
  }

  stop(): void {
    this.isRunning = false;
    this.cleanup();
  }

  private cleanup(): void {
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
    
    // Detect motion/hand movement
    if (this.previousFrame) {
      const motion = this.detectMotion(this.previousFrame, currentFrame);
      
      if (motion) {
        this.processMotion(motion);
      }
    }
    
    this.previousFrame = currentFrame;
    
    // Schedule next frame at target FPS
    setTimeout(() => {
      this.animationFrameId = requestAnimationFrame(() => this.detectGestures());
    }, 1000 / this.DETECTION_FPS);
  }

  private detectMotion(
    prev: ImageData,
    curr: ImageData
  ): { x: number; y: number; magnitude: number } | null {
    const width = prev.width;
    const height = prev.height;
    const threshold = 30; // Pixel difference threshold
    
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
    
    if (motionPixels < 50) return null; // Not enough motion
    
    // Calculate center of motion
    const centerX = totalDiffX / motionPixels / width;
    const centerY = totalDiffY / motionPixels / height;
    const magnitude = motionPixels / ((width * height) / 16); // Normalized
    
    return { x: centerX, y: centerY, magnitude };
  }

  private processMotion(motion: { x: number; y: number; magnitude: number }): void {
    const now = Date.now();
    
    // Check cooldown
    if (now - this.gestureState.lastGestureTime < this.GESTURE_COOLDOWN) {
      return;
    }
    
    if (!this.gestureState.isActive) {
      // Start tracking gesture
      this.gestureState.isActive = true;
      this.gestureState.lastPosition = { x: motion.x, y: motion.y };
      this.gestureState.gestureStartTime = now;
      return;
    }
    
    if (!this.gestureState.lastPosition) return;
    
    const deltaX = motion.x - this.gestureState.lastPosition.x;
    const deltaY = motion.y - this.gestureState.lastPosition.y;
    const gestureTime = now - this.gestureState.gestureStartTime;
    
    // Detect gesture after minimum time
    if (gestureTime > 100) {
      let action: GestureAction = 'none';
      
      // Determine gesture type based on movement
      if (Math.abs(deltaX) > this.SWIPE_THRESHOLD) {
        action = deltaX > 0 ? 'swipe_right' : 'swipe_left';
      } else if (Math.abs(deltaY) > this.SWIPE_THRESHOLD) {
        action = deltaY > 0 ? 'swipe_down' : 'swipe_up';
      } else if (Math.abs(deltaX) < this.TAP_THRESHOLD && Math.abs(deltaY) < this.TAP_THRESHOLD) {
        if (motion.magnitude > 0.1) {
          action = 'tap';
        }
      }
      
      if (action !== 'none' && this.callback) {
        this.callback(action);
        this.gestureState.lastGestureTime = now;
      }
      
      // Reset tracking
      this.gestureState.isActive = false;
      this.gestureState.lastPosition = null;
    } else {
      // Update last position for continuous tracking
      this.gestureState.lastPosition = { x: motion.x, y: motion.y };
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const gestureNavigator = new GestureNavigator();
