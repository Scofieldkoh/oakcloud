'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Send, Upload, ClipboardCopy, MonitorPlay } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ActionsMenu } from '@/components/ui/actions-menu';
import { DropdownItem } from '@/components/ui/dropdown';
import { SentrowebCheckMenuItem } from './sentroweb-check-action';

interface CompanyActionsMenuProps {
  companyId: string;
  companyUen: string;
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
  companyUen,
  annualReturn,
  bizFileUrl,
  canUpdateDocument,
  canUpdateCompany,
  onOpenSentrowebCheck,
}: CompanyActionsMenuProps) {
  const router = useRouter();
  const [acraDialogOpen, setAcraDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <>
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
        <DropdownItem
          icon={<MonitorPlay className="h-4 w-4" />}
          onClick={() => setAcraDialogOpen(true)}
          description="Local browser filing pilot (not yet connected)"
        >
          ACRA filing assistant
        </DropdownItem>
      ) : null}
      {canUpdateCompany ? (
        <SentrowebCheckMenuItem companyId={companyId} onOpen={onOpenSentrowebCheck} />
      ) : null}
    </ActionsMenu>
    <Modal isOpen={acraDialogOpen} onClose={() => setAcraDialogOpen(false)} title="ACRA filing assistant" size="lg">
      <div className="space-y-4 p-5 text-sm text-text-secondary">
        <p><strong className="text-text-primary">Local agent pilot — not connected.</strong> This is the entry point for attended ACRA filing. Browser automation requires the local Windows agent to be installed and running on the staff computer.</p>
        <div className="rounded-lg border border-border-primary p-3 space-y-1">
          <p className="font-medium text-text-primary">Company UEN: {companyUen}</p>
          <p>Staff must log in to Bizfile using their own Singpass/Corppass account and review any filing before submission.</p>
        </div>
        <p>The current pilot does not populate forms, submit filings, or update company records. Do not treat opening Bizfile as a completed filing.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-2" onClick={() => { void navigator.clipboard.writeText(companyUen).then(() => setCopied(true)).catch(() => setCopied(false)); }}>
            <ClipboardCopy className="h-4 w-4" />{copied ? 'UEN copied' : 'Copy UEN'}
          </button>
          <a href="https://www.bizfile.gov.sg/" target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />Open ACRA Bizfile
          </a>
        </div>
      </div>
    </Modal>
    </>
  );
}
