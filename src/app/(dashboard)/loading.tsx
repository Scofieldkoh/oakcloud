import { LottieLoader } from '@/components/ui/lottie-loader';

export default function DashboardLoading() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center">
      <LottieLoader size="lg" message="Loading..." />
    </div>
  );
}
