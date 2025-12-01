import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-oak-light animate-spin" />
        <p className="text-text-tertiary text-sm">Loading...</p>
      </div>
    </div>
  );
}
