import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import introVideo from "/intro.mp4?url";

interface SplashVideoProps {
  onComplete: () => void;
  /** Hard cap (ms) in case video metadata never loads */
  maxDurationMs?: number;
}

/**
 * Fullscreen cinematic intro video.
 * - Autoplays muted + playsInline (Android WebView + iOS Safari friendly)
 * - Locks scroll while visible
 * - Fades out smoothly on `ended` / error / timeout
 */
export function SplashVideo({ onComplete, maxDurationMs = 8000 }: SplashVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(true);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setVisible(false);
  }, []);

  // Lock body scroll while splash is up
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Safety timeout: never block app longer than maxDurationMs
  useEffect(() => {
    const t = window.setTimeout(finish, maxDurationMs);
    return () => window.clearTimeout(t);
  }, [finish, maxDurationMs]);

  // Try to kick playback on mount (some webviews need an explicit play call)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // Autoplay blocked — just finish gracefully
          finish();
        });
      }
    };
    if (v.readyState >= 2) tryPlay();
    else v.addEventListener("loadeddata", tryPlay, { once: true });
    return () => v.removeEventListener("loadeddata", tryPlay);
  }, [finish]);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <video
            ref={videoRef}
            src={introVideo}
            autoPlay
            muted
            playsInline
            {...({ "webkit-playsinline": "true" } as any)}
            preload="auto"
            disableRemotePlayback
            onEnded={finish}
            onError={finish}
            className="w-full h-full object-cover"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SplashVideo;
