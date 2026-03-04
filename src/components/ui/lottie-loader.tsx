'use client';

import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { cn } from '@/lib/utils';

interface LottieLoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeConfig = {
  sm: { dimension: 48, text: 'text-xs' },
  md: { dimension: 80, text: 'text-sm' },
  lg: { dimension: 120, text: 'text-sm' },
};

export function LottieLoader({
  message,
  size = 'md',
  className,
}: LottieLoaderProps) {
  const config = sizeConfig[size];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col items-center justify-center gap-2', className)}
    >
      <DotLottieReact
        src="/animations/loading.lottie"
        loop
        autoplay
        style={{ width: config.dimension, height: config.dimension }}
      />
      {message && (
        <p className={cn(config.text, 'text-text-tertiary')}>{message}</p>
      )}
      <span className="sr-only">Loading</span>
    </div>
  );
}
