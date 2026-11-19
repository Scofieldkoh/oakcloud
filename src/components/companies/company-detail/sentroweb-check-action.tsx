'use client';

import { useIsMutating } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { DropdownItem } from '@/components/ui/dropdown';
import { sentrowebStartMutationKey } from '@/hooks/use-sentroweb-checks';

/** True while a Sentroweb check is being started for the company. */
export function useSentrowebStartPending(companyId: string): boolean {
  return useIsMutating({ mutationKey: sentrowebStartMutationKey(companyId) }) > 0;
}

interface SentrowebCheckMenuItemProps {
  companyId: string;
  /** Opens the Sentroweb check dialog, which the page renders outside the menu. */
  onOpen: () => void;
}

/** The "Sentroweb check" item in the company Actions menu (F4). */
export function SentrowebCheckMenuItem({ companyId, onOpen }: SentrowebCheckMenuItemProps) {
  const isStarting = useSentrowebStartPending(companyId);

  return (
    <DropdownItem
      icon={<ShieldCheck className="h-4 w-4" />}
      onClick={onOpen}
      disabled={isStarting}
      description={isStarting ? 'Starting a check...' : undefined}
    >
      Sentroweb check
    </DropdownItem>
  );
}
