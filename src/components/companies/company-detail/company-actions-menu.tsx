'use client';

import { useEffect, useState } from 'react';
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
  const [rememberPairing, setRememberPairing] = useState(false);
  const [agentStatus, setAgentStatus] = useState('Not checked');
  const [agentBusy, setAgentBusy] = useState(false);
  const [researchSnapshot, setResearchSnapshot] = useState<Record<string, unknown> | null>(null);
  const [filingType, setFilingType] = useState<'officers' | 'address' | 'shares'>('officers');
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const agentUrl = 'http://127.0.0.1:48731';
  const pairingStorageKey = 'oakcloud:acra-agent-pairing:v1';
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(pairingStorageKey);
      if (stored) {
        setAgentToken(stored);
        setRememberPairing(true);
      }
    } catch { /* Browser storage may be disabled. */ }
  }, []);
  function updatePairing(token: string, remember: boolean) {
    setAgentToken(token);
    setRememberPairing(remember);
    try {
      if (remember && token.trim()) window.localStorage.setItem(pairingStorageKey, token.trim());
      else window.localStorage.removeItem(pairingStorageKey);
    } catch { setAgentStatus('Browser storage unavailable. Pairing will last only until this page closes.'); }
  }
  async function callAgent(path: '/health' | '/launch-remote' | '/poc-fill' | '/research-snapshot' | '/research-explore') {
    if (!agentToken.trim()) { setAgentStatus('Enter the pairing token from the installer.'); return; }
    setAgentBusy(true);
    try {
      const response = await fetch(`${agentUrl}${path}`, {
        method: path === '/health' || path === '/research-snapshot' ? 'GET' : 'POST',
        headers: { 'X-OakCloud-Agent-Token': agentToken.trim() },
        cache: 'no-store',
        signal: AbortSignal.timeout(path === '/research-explore' ? 90000 : 12000),
      });
      if (!response.ok) throw new Error(`Agent returned HTTP ${response.status}`);
      if (path === '/research-snapshot' || path === '/research-explore') {
        const result = await response.json() as {snapshot?: Record<string, unknown>; research?: Record<string, unknown>};
        if (!result.snapshot && !result.research) throw new Error('Research data missing from agent response');
        setResearchSnapshot(result.snapshot ?? result.research ?? null);
        setAgentStatus('Research data captured locally in this browser. Review before exporting.');
        return;
      }
      setAgentStatus(path === '/health' ? 'Agent connected on this PC.' : path === '/poc-fill' ? 'POC attempted. Check the Chromium window and verify the Director selection.' : 'Browser launch requested on this PC.');
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
        <label className="block space-y-1"><span>Local agent pairing token</span><input type="password" autoComplete="off" value={agentToken} onChange={(event) => updatePairing(event.target.value, rememberPairing)} placeholder="Paste token from installer" className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-text-primary" /></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={rememberPairing} onChange={(event) => updatePairing(agentToken, event.target.checked)} /><span>Remember pairing on this browser (stored locally; use only on a trusted PC). Uncheck to forget it.</span></label>
        <p role="status">{agentStatus}</p>
        <label className="flex items-start gap-2"><input type="checkbox" checked={reviewAcknowledged} onChange={(event) => setReviewAcknowledged(event.target.checked)} /><span>I understand this is an attended pilot. I will verify the selected company and filing information and manually control any declaration, payment and submission.</span></label>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={agentBusy} className="btn-secondary btn-sm" onClick={() => void callAgent('/health')}>Check local agent</button><button type="button" disabled={agentBusy || !reviewAcknowledged} className="btn-primary btn-sm" onClick={() => void callAgent('/launch-remote')}>Launch Bizfile on this PC</button><button type="button" disabled={agentBusy || !reviewAcknowledged} className="btn-secondary btn-sm" onClick={() => void callAgent('/research-snapshot')}>Capture research snapshot</button><button type="button" disabled={agentBusy || !reviewAcknowledged} className="btn-secondary btn-sm" onClick={() => void callAgent('/research-explore')}>Auto-explore safe dropdowns</button>{filingType === 'officers' ? <button type="button" disabled={agentBusy || !reviewAcknowledged} className="btn-secondary btn-sm" onClick={() => void callAgent('/poc-fill')}>POC: Add Director (no save)</button> : null}</div>
        <p>Auto-explore tests up to 40 options in native dropdowns on the current page and attempts to restore selections. Use only in a test filing: changing a dropdown can trigger server-side effects. Custom dropdowns and nested branches are not yet supported.</p>
        {researchSnapshot ? <div className="space-y-2 rounded-lg border border-border-primary p-3">
          <p className="font-medium text-text-primary">Research snapshot — review before exporting</p>
          <p>Captures field labels, field types, headings and buttons; excludes entered field values, cookies and URL query parameters. Labels may still contain sensitive information, so inspect the export.</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-background-secondary p-2 text-xs">{JSON.stringify(researchSnapshot, null, 2)}</pre>
          <button type="button" className="btn-secondary btn-sm" onClick={() => {
            const blob = new Blob([JSON.stringify(researchSnapshot, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'acra-research-snapshot.json';
            anchor.click();
            URL.revokeObjectURL(url);
          }}>Export reviewed JSON</button>
        </div> : null}
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
