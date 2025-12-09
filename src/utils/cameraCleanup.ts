/**
 * Camera cleanup utilities for proper resource management
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
  });
  
  videoEl.srcObject = null;
};

/**
 * Stops a MediaStream directly
 */
export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) return;
  
  stream.getTracks().forEach(track => {
    track.stop();
  });
};

/**
 * Cleanup function for animation frames
 */
export const cancelAnimationFrameSafe = (frameId: number | null): void => {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
};

/**
 * Cleanup function for intervals
 */
export const clearIntervalSafe = (intervalId: ReturnType<typeof setInterval> | null): void => {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
};
