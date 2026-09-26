'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileOutput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOakDocConversion } from '@/hooks/use-oakdoc-conversion';

interface ConvertToOakDocButtonProps {
  documentId: string;
  revision: number;
  disabled?: boolean;
  onError: (message: string) => void;
}

/** Make a reviewable OakDoc copy of one A4 draft (P8); the original is kept. */
export function ConvertToOakDocButton({ documentId, revision, disabled, onError }: ConvertToOakDocButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mutation = useOakDocConversion(documentId);

  const convert = async () => {
    try {
      const result = await mutation.mutateAsync({ action: 'convert', expectedRevision: revision });
      setOpen(false);
      router.push(`/generated-documents/${result.document.id}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not convert the draft');
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled || mutation.isPending}>
        <FileOutput className="mr-2 h-4 w-4" />
        Convert to OakDoc
      </Button>
      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={convert}
        title="Convert to OakDoc?"
        description="This makes a new OakDoc copy of this draft for you to review. This A4 draft is not changed. Anything that can't be carried over is listed on the copy."
        confirmLabel="Make OakDoc copy"
        variant="info"
        isLoading={mutation.isPending}
      />
    </>
  );
}
