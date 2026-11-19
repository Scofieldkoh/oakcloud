'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink, Send, Upload } from 'lucide-react';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { DropdownItem } from '@/components/ui/dropdown';
import { SentrowebCheckMenuItem } from './sentroweb-check-action';

interface CompanyActionsMenuProps {
  companyId: string;
  /** Annual return declaration: unavailable until its form is published in Forms. */
  annualReturn: {
    available: boolean;
    isPreparing: boolean;
    onSend: () => void;
  };
  /** The latest BizFile PDF, when there is one. */
  bizFileUrl?: string | null;
  canUpdateDocument: boolean;
  canUpdateCompany: boolean;
  onOpenSentrowebCheck: () => void;
}

/** The company detail page's "Actions" menu: annual return, BizFile and Sentroweb actions. */
export function CompanyActionsMenu({
  companyId,
  annualReturn,
  bizFileUrl,
  canUpdateDocument,
  canUpdateCompany,
  onOpenSentrowebCheck,
}: CompanyActionsMenuProps) {
  const router = useRouter();

  return (
    <ActionsMenu>
      <DropdownItem
        icon={<Send className="h-4 w-4" />}
        onClick={annualReturn.onSend}
        disabled={!annualReturn.available || annualReturn.isPreparing}
        description={
          !annualReturn.available
            ? 'Publish the Annual Return Declaration form in Forms first'
            : annualReturn.isPreparing
              ? 'Preparing...'
              : undefined
        }
      >
        Send annual return declaration
      </DropdownItem>
      {bizFileUrl ? (
        <DropdownItem
          icon={<ExternalLink className="h-4 w-4" />}
          onClick={() => window.open(bizFileUrl, '_blank')}
        >
          View BizFile
        </DropdownItem>
      ) : null}
      {canUpdateDocument ? (
        <DropdownItem
          icon={<Upload className="h-4 w-4" />}
          onClick={() => router.push(`/companies/upload?companyId=${companyId}`)}
        >
          Update via BizFile
        </DropdownItem>
      ) : null}
      {canUpdateCompany ? (
        <SentrowebCheckMenuItem companyId={companyId} onOpen={onOpenSentrowebCheck} />
      ) : null}
    </ActionsMenu>
  );
}
