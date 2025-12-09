/**
 * Camera utilities for proper resource management
 */

/**
 * Stops all tracks from a video element's media stream
 */
export const stopCameraStream = (videoEl: HTMLVideoElement | null): void => {
  if (!videoEl) return;
  
  const stream = videoEl.srcObject as MediaStream | null;
  if (!stream) return;
  
  stream.getTracks().forEach(track => {
    track.stop();
    console.log('[Camera] Stopped track:', track.kind, track.label);
  });
  
  videoEl.srcObject = null;
  videoEl.load(); // Reset video element
};

/**
 * Stops a MediaStream directly
 */
export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) return;
  
  stream.getTracks().forEach(track => {
    track.stop();
    console.log('[Camera] Stopped stream track:', track.kind, track.label);
  });
};

/**
 * Cleanup function for animation frames
 */
export const cancelAnimationFrameSafe = (frameId: number | null): void => {
  if (frameId !== null && frameId !== undefined) {
    cancelAnimationFrame(frameId);
  }
};

/**
 * Cleanup function for intervals
 */
export const clearIntervalSafe = (intervalId: ReturnType<typeof setInterval> | null): void => {
  if (intervalId !== null && intervalId !== undefined) {
    clearInterval(intervalId);
  }
};

/**
 * Check if we're in a secure context (HTTPS or localhost)
 */
export const isSecureContext = (): boolean => {
  return window.isSecureContext || 
         window.location.protocol === 'https:' || 
         window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
};

/**
 * Check if getUserMedia is available
 */
export const isCameraAvailable = (): boolean => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

/**
 * Get optimal camera constraints for the platform
 */
export const getCameraConstraints = (facingMode: 'user' | 'environment' = 'user', lowRes = false): MediaStreamConstraints => {
  const videoConstraints: MediaTrackConstraints = {
    facingMode,
  };

  if (lowRes) {
    // Low resolution for gesture detection
    videoConstraints.width = { ideal: 320, max: 640 };
    videoConstraints.height = { ideal: 240, max: 480 };
    videoConstraints.frameRate = { ideal: 15, max: 30 };
  } else {
    // Higher resolution for scanning
    videoConstraints.width = { ideal: 1280, max: 1920 };
    videoConstraints.height = { ideal: 720, max: 1080 };
  }

  return {
    video: videoConstraints,
    audio: false,
  };
};

/**
 * Setup video element for autoplay compatibility
 */
export const setupVideoElement = (video: HTMLVideoElement): void => {
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', 'true');
  video.setAttribute('autoplay', 'true');
  video.setAttribute('playsinline', 'true');
};

/**
 * Request camera with proper error handling
 */
export const requestCamera = async (
  constraints: MediaStreamConstraints
): Promise<MediaStream | null> => {
  if (!isCameraAvailable()) {
    console.error('[Camera] getUserMedia not available');
    return null;
  }

  if (!isSecureContext()) {
    console.error('[Camera] Not in secure context (HTTPS required)');
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('[Camera] Stream obtained:', stream.getVideoTracks().map(t => t.label));
    return stream;
  } catch (error: any) {
    console.error('[Camera] Error requesting camera:', error.name, error.message);
    
    // Try fallback constraints
    if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
      console.log('[Camera] Trying fallback constraints...');
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        return fallbackStream;
      } catch (fallbackError) {
        console.error('[Camera] Fallback also failed:', fallbackError);
      }
    }
    
    return null;
  }
};
