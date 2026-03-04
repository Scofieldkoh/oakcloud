'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useNavigationProgress } from '@/hooks/use-navigation-progress';
import { useIsMobile } from '@/hooks/use-media-query';

export function NavigationProgress() {
  const { isNavigating } = useNavigationProgress();
  const isMobile = useIsMobile();
  const animationSize = isMobile ? 720 : 450;
  const [showOverlay, setShowOverlay] = useState(false);
  const [progress, setProgress] = useState(0);

  // Progress bar animation
  useEffect(() => {
    if (isNavigating) {
      setProgress(0);

      // Quick jump to 30%, then slow crawl to 90%
      const t1 = setTimeout(() => setProgress(30), 50);
      const t2 = setTimeout(() => setProgress(60), 300);
      const t3 = setTimeout(() => setProgress(80), 1000);
      const t4 = setTimeout(() => setProgress(90), 2000);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    } else if (progress > 0) {
      // Complete the bar
      setProgress(100);
      const t = setTimeout(() => setProgress(0), 200);
      return () => clearTimeout(t);
    }
  }, [isNavigating]);

  // Delayed overlay (300ms)
  useEffect(() => {
    if (isNavigating) {
      const t = setTimeout(() => setShowOverlay(true), 300);
      return () => clearTimeout(t);
    } else {
      setShowOverlay(false);
    }
  }, [isNavigating]);

  return (
    <>
      {/* Top progress bar */}
      {progress > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
          <div
            className="h-full bg-oak-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Lottie overlay */}
      <AnimatePresence>
        {showOverlay && isNavigating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-background-primary/60 backdrop-blur-sm"
          >
            <DotLottieReact
              src="/animations/loading.lottie"
              loop
              autoplay
              style={{ width: animationSize, height: animationSize }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
