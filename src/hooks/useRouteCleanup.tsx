import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { forceStopAllCameras } from '@/utils/globalCameraManager';
import { gestureNavigator } from '@/services/gestureNavigator';

// Pages that are allowed to use camera
const CAMERA_PAGES = ['/scan'];

/**
 * Hook to cleanup camera resources when navigating away from camera-dependent pages
 * This ensures cameras are properly stopped when user leaves Scan page
 */
export const useRouteCleanup = () => {
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    const currentPath = location.pathname;
    const wasOnCameraPage = CAMERA_PAGES.some(page => previousPath.current.startsWith(page));
    const isOnCameraPage = CAMERA_PAGES.some(page => currentPath.startsWith(page));

    // If leaving a camera page, force cleanup
    if (wasOnCameraPage && !isOnCameraPage) {
      console.log('[RouteCleanup] Left camera page, cleaning up...');
      
      // Stop scan page camera (gesture camera is managed separately)
      if (!gestureNavigator.isActive()) {
        forceStopAllCameras();
      } else {
        // If gestures are active, only stop video elements that aren't gesture-related
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
          // Gesture video is hidden off-screen
          if (video.style.top !== '-9999px') {
            const stream = video.srcObject as MediaStream | null;
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
              video.srcObject = null;
            }
          }
        });
      }
    }

    previousPath.current = currentPath;
  }, [location.pathname]);
};
