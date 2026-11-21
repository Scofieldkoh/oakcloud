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
  const [agentToken, setAgentToken] = useState('');
  const [agentStatus, setAgentStatus] = useState('Not checked');
  const [agentBusy, setAgentBusy] = useState(false);
  const [filingType, setFilingType] = useState<'officers' | 'address' | 'shares'>('officers');
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const agentUrl = 'http://127.0.0.1:48731';
  async function callAgent(path: '/health' | '/launch-remote') {
    if (!agentToken.trim()) { setAgentStatus('Enter the pairing token from the installer.'); return; }
    setAgentBusy(true);
    try {
      const response = await fetch(`${agentUrl}${path}`, {
        method: path === '/health' ? 'GET' : 'POST',
        headers: { 'X-OakCloud-Agent-Token': agentToken.trim() },
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Agent returned HTTP ${response.status}`);
      setAgentStatus(path === '/health' ? 'Agent connected on this PC.' : 'Browser launch requested on this PC.');
    } catch (error) {
      setAgentStatus(`Could not reach agent: ${error instanceof Error ? error.message : 'Unknown error'}. Check the agent is running and its allowed OakCloud URL matches this site.`);
    } finally { setAgentBusy(false); }
  }

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
          description="Connect to the local Windows browser agent"
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
        <p><strong className="text-text-primary">Local browser agent pilot.</strong> This is the entry point for attended ACRA filing. The Windows agent must be running on this computer and paired with this OakCloud origin.</p>
        <div className="rounded-lg border border-border-primary p-3 space-y-1">
          <p className="font-medium text-text-primary">Company UEN: {companyUen}</p>
          <p>Staff must log in to Bizfile using their own Singpass/Corppass account and review any filing before submission.</p>
        </div>
        <label className="block space-y-1"><span>Filing transaction (preparation only)</span><select value={filingType} onChange={(event) => { setFilingType(event.target.value as 'officers' | 'address' | 'shares'); setReviewAcknowledged(false); }} className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-text-primary"><option value="officers">Change of company officers — pilot</option><option value="address">Registered address — manual only</option><option value="shares">Share particulars — manual only</option></select></label>
        {filingType === 'officers' ? <div className="rounded-lg border border-border-primary p-3 space-y-2"><p className="font-medium text-text-primary">Officer-change filing checklist</p><p>Confirm the company UEN, officer identity, appointment or cessation type, effective date, supporting approvals and required consents against the signed documents before entering Bizfile.</p><p>This pilot opens Bizfile only. It does not select a transaction, read officer details, or fill fields.</p></div> : <p>Selected transaction is not automated. Continue manually in Bizfile.</p>}
        <label className="block space-y-1"><span>Local agent pairing token</span><input type="password" autoComplete="off" value={agentToken} onChange={(event) => setAgentToken(event.target.value)} placeholder="Paste token from installer" className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-text-primary" /></label>
        <p role="status">{agentStatus}</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={reviewAcknowledged} onChange={(event) => setReviewAcknowledged(event.target.checked)} /><span>I understand this is an attended pilot. I will verify the selected company and filing information and manually control any declaration, payment and submission.</span></label>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={agentBusy} className="btn-secondary btn-sm" onClick={() => void callAgent('/health')}>Check local agent</button><button type="button" disabled={agentBusy || !reviewAcknowledged} className="btn-primary btn-sm" onClick={() => void callAgent('/launch-remote')}>Launch Bizfile on this PC</button></div>
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
