/**
 * Central Camera Manager
 * Single source of truth for camera access across the app.
 * All camera usage (Scan, Air Gestures) must go through this manager.
 */

let activeStream: MediaStream | null = null;

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
 * Get camera constraints for different use cases
 */
export const getCameraConstraints = (
  facingMode: 'user' | 'environment' = 'environment',
  lowRes = false
): MediaStreamConstraints => {
  return {
    video: {
      facingMode,
      width: lowRes ? { ideal: 320, max: 640 } : { ideal: 1280, max: 1920 },
      height: lowRes ? { ideal: 240, max: 480 } : { ideal: 720, max: 1080 },
      ...(lowRes ? { frameRate: { ideal: 15, max: 30 } } : {}),
    },
    audio: false,
  };
};

/**
 * Request camera with proper error handling
 */
export const requestCamera = async (
  constraints: MediaStreamConstraints
): Promise<MediaStream | null> => {
  if (!isCameraAvailable()) {
    console.error('[CameraManager] getUserMedia not available');
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('[CameraManager] Stream obtained:', stream.getVideoTracks().map(t => t.label));
    activeStream = stream;
    return stream;
  } catch (error: any) {
    console.error('[CameraManager] Error requesting camera:', error.name, error.message);
    
    // Try fallback constraints
    if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
      console.log('[CameraManager] Trying fallback constraints...');
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        activeStream = fallbackStream;
        return fallbackStream;
      } catch (fallbackError) {
        console.error('[CameraManager] Fallback also failed:', fallbackError);
      }
    }
    
    return null;
  }
};

/**
 * Start camera and attach to video element
 */
export const startCamera = async (video: HTMLVideoElement): Promise<void> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia not supported');
  }

  // Stop any existing stream first
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
    },
    audio: false,
  });

  video.srcObject = stream;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  activeStream = stream;

  console.log('[CameraManager] Camera started');
};

/**
 * Stop camera on specific video element
 */
export const stopCamera = (video?: HTMLVideoElement | null): void => {
  if (video && video.srcObject) {
    const stream = video.srcObject as MediaStream;
    stream.getTracks().forEach(t => {
      t.stop();
      console.log('[CameraManager] Stopped track:', t.kind, t.label);
    });
    video.srcObject = null;
  }

  if (activeStream) {
    activeStream.getTracks().forEach(t => {
      t.stop();
    });
    activeStream = null;
  }
};

/**
 * Stop a MediaStream directly
 */
export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) return;
  stream.getTracks().forEach(t => {
    t.stop();
    console.log('[CameraManager] Stopped stream track:', t.kind, t.label);
  });
};

/**
 * Force stop ALL cameras in the document (safety net)
 */
export const forceStopAllCameras = (): void => {
  console.log('[CameraManager] Force stopping all cameras...');
  
  const videos = document.querySelectorAll('video');
  videos.forEach((v: HTMLVideoElement) => {
    if (v.srcObject) {
      const stream = v.srcObject as MediaStream;
      stream.getTracks().forEach(t => {
        t.stop();
      });
      v.srcObject = null;
    }
  });

  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }

  console.log('[CameraManager] All cameras stopped');
};

/**
 * Check if camera is available
 */
export const isCameraAvailable = (): boolean => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

/**
 * Check if we have an active stream
 */
export const hasActiveStream = (): boolean => {
  return activeStream !== null && activeStream.active;
};
