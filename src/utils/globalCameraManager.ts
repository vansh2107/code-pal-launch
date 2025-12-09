/**
 * Global Camera Manager
 * Ensures only ONE camera stream runs at a time
 * Provides universal cleanup for all camera resources
 */

let cameraInUse = false;
let currentOwner: string | null = null;

/**
 * Force stop ALL cameras across the entire application
 * Call this when navigating away from camera-dependent screens
 */
export const forceStopAllCameras = (): void => {
  console.log('[CameraManager] Force stopping all cameras...');
  
  // Find and stop ALL video elements
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    const stream = video.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('[CameraManager] Stopped track:', track.kind, track.label);
      });
      video.srcObject = null;
    }
    // Reset video element
    video.load();
  });
  
  // Reset global state
  cameraInUse = false;
  currentOwner = null;
  
  console.log('[CameraManager] All cameras stopped');
};

/**
 * Request camera access with global management
 * Prevents multiple simultaneous camera streams
 */
export const requestManagedCamera = async (
  owner: string,
  constraints: MediaStreamConstraints
): Promise<MediaStream | null> => {
  console.log(`[CameraManager] Camera requested by: ${owner}`);
  
  // If camera is in use by different owner, stop it first
  if (cameraInUse && currentOwner !== owner) {
    console.log(`[CameraManager] Camera was used by ${currentOwner}, stopping first...`);
    forceStopAllCameras();
  }
  
  // If already in use by same owner, allow
  if (cameraInUse && currentOwner === owner) {
    console.log(`[CameraManager] Camera already owned by ${owner}`);
    return null;
  }
  
  try {
    cameraInUse = true;
    currentOwner = owner;
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log(`[CameraManager] Camera granted to: ${owner}`);
    return stream;
  } catch (error) {
    console.error('[CameraManager] Failed to get camera:', error);
    cameraInUse = false;
    currentOwner = null;
    return null;
  }
};

/**
 * Release camera by specific owner
 */
export const releaseCameraByOwner = (owner: string): void => {
  if (currentOwner === owner) {
    console.log(`[CameraManager] Camera released by: ${owner}`);
    forceStopAllCameras();
  }
};

/**
 * Check if camera is currently in use
 */
export const isCameraInUse = (): boolean => cameraInUse;

/**
 * Get current camera owner
 */
export const getCameraOwner = (): string | null => currentOwner;

/**
 * Stop all animation frame loops
 * Useful for stopping gesture detection loops
 */
let activeAnimationFrames: Set<number> = new Set();

export const registerAnimationFrame = (id: number): void => {
  activeAnimationFrames.add(id);
};

export const unregisterAnimationFrame = (id: number): void => {
  activeAnimationFrames.delete(id);
};

export const cancelAllAnimationFrames = (): void => {
  activeAnimationFrames.forEach(id => {
    cancelAnimationFrame(id);
  });
  activeAnimationFrames.clear();
  console.log('[CameraManager] All animation frames cancelled');
};

/**
 * Complete cleanup - cameras and animation frames
 */
export const forceCleanupAll = (): void => {
  cancelAllAnimationFrames();
  forceStopAllCameras();
};
