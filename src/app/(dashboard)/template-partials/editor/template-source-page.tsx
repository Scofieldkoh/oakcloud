'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Upload } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { A4HistoricalViewer } from '@/components/documents/a4-historical-viewer';
import { extractA4DocumentLayout } from '@/components/documents/a4-pagination/layout';
import { readOakDocTemplateMetadata, isOakDocTemplate } from '@/lib/document-editor/oakdoc-template';
import {
  useSaveWordPartial,
  useTemplatePartial,
  type TemplatePartialWithRelations,
} from '@/hooks/use-template-partials';

const OAKDOC_TEMPLATE_EDITOR = '/generated-documents/generate?editor=oakdoc';

interface StoredTemplate {
  id: string;
  name: string;
  content: string;
  contentJson: unknown;
}

async function fetchWordReplacementId(id: string): Promise<string | null> {
  const response = await fetch(`/api/document-templates/new-run?templateId=${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const [replacementId] = Array.isArray(payload.templateIds) ? payload.templateIds : [];
  return typeof replacementId === 'string' && replacementId !== id ? replacementId : null;
}

async function fetchTemplate(id: string): Promise<StoredTemplate> {
  const response = await fetch(`/api/document-templates/${encodeURIComponent(id)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to load the template');
  return payload as StoredTemplate;
}

function PageShell({ backHref, backLabel, title, children }: {
  backHref: string;
  backLabel: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <div>
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin text-accent-primary" aria-label="Loading" />
    </div>
  );
}

/** Read-only view of an A4 template or HTML partial. */
function RetiredA4Source({ html, contentJson, notice }: {
  html: string;
  contentJson?: unknown;
  notice: string;
}) {
  return (
    <>
      <Alert variant="info" compact>{notice}</Alert>
      <div className="min-h-[60vh] flex-1 overflow-hidden rounded-lg border border-border-primary">
        <A4HistoricalViewer html={html} layout={extractA4DocumentLayout(contentJson)} />
      </div>
    </>
  );
}

function TemplateSource({ id }: { id: string | null }) {
  const router = useRouter();
  const { data, error, isLoading } = useQuery({
    queryKey: ['document-template-source', id],
    queryFn: () => fetchTemplate(id!),
    enabled: Boolean(id),
  });
  const isOakDoc = data ? isOakDocTemplate(data.contentJson) : false;
  const { data: replacementId } = useQuery({
    queryKey: ['document-template-word-replacement', id],
    queryFn: () => fetchWordReplacementId(id!),
    enabled: Boolean(id && data && !isOakDoc),
  });

  useEffect(() => {
    if (!id) router.replace(OAKDOC_TEMPLATE_EDITOR);
    else if (isOakDoc) router.replace(`${OAKDOC_TEMPLATE_EDITOR}&templateId=${encodeURIComponent(id)}`);
  }, [id, isOakDoc, router]);

  if (!id || isLoading || isOakDoc) return <Loading />;
  if (error || !data) {
    return <Alert variant="error">{error instanceof Error ? error.message : 'Failed to load the template'}</Alert>;
  }
  return (
    <PageShell backHref="/template-partials?tab=templates" backLabel="Back to templates" title={data.name}>
      {replacementId && (
        <Alert variant="success" compact>
          This template has an approved Word version.{' '}
          <Link
            href={`${OAKDOC_TEMPLATE_EDITOR}&templateId=${encodeURIComponent(replacementId)}`}
            className="font-medium underline"
          >
            Open the Word version
          </Link>
        </Alert>
      )}
      <RetiredA4Source
        html={data.content}
        contentJson={data.contentJson}
        notice="This template was made with the retired A4 editor and can only be viewed. To keep using it, create a Word template with the same content."
      />
    </PageShell>
  );
}

function WordPartialForm({ partial }: { partial: TemplatePartialWithRelations | null }) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const save = useSaveWordPartial();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const asset = partial ? readOakDocTemplateMetadata(partial.contentJson) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    try {
      const saved = await save.mutateAsync(partial
        ? { id: partial.id, expectedRevision: partial.version, file }
        : { name: name.trim(), displayName: displayName.trim(), description: description.trim(), file });
      success(partial ? 'New version uploaded' : 'Word partial created');
      setFile(null);
      if (!partial) router.replace(`/template-partials/editor?type=partial&tab=partials&id=${saved.id}`);
    } catch (caught) {
      toastError(caught instanceof Error ? caught.message : 'Failed to save the Word partial');
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="max-w-xl space-y-4">
      <p className="text-sm text-text-secondary">
        A Word partial is a .docx with reusable wording, inserted into Word templates from the template editor.
        Templates keep the version they were saved with until someone updates them.
      </p>
      {partial ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-primary p-3 text-sm">
          <span className="text-text-secondary">
            Version {partial.version}{asset ? ` · ${asset.fileName}` : ''}
          </span>
          <a
            href={`/api/template-partials/${partial.id}/oakdoc`}
            className="inline-flex items-center gap-1.5 text-oak-primary hover:underline"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download current version
          </a>
        </div>
      ) : (
        <>
          <FormInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint="Letters, numbers, hyphens and underscores, starting with a letter."
            required
          />
          <FormInput label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <FormInput label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        </>
      )}
      <FormInput
        label={partial ? 'New version (.docx)' : 'Word document (.docx)'}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <Button
        type="submit"
        variant="primary"
        leftIcon={<Upload className="h-4 w-4" />}
        disabled={!file || (!partial && !name.trim()) || save.isPending}
      >
        {partial ? 'Upload new version' : 'Create Word partial'}
      </Button>
    </form>
  );
}

function PartialSource({ id }: { id: string | null }) {
  const { data: partial, error, isLoading } = useTemplatePartial(id);
  if (!id) {
    return (
      <PageShell backHref="/template-partials?tab=partials" backLabel="Back to partials" title="New Word partial">
        <WordPartialForm partial={null} />
      </PageShell>
    );
  }
  if (isLoading) return <Loading />;
  if (error || !partial) {
    return <Alert variant="error">{error instanceof Error ? error.message : 'Failed to load the partial'}</Alert>;
  }
  const title = partial.displayName || partial.name;
  return (
    <PageShell backHref="/template-partials?tab=partials" backLabel="Back to partials" title={title}>
      {readOakDocTemplateMetadata(partial.contentJson) ? (
        <WordPartialForm partial={partial} />
      ) : (
        <RetiredA4Source
          html={partial.content}
          notice="This partial was made with the retired A4 editor and can only be viewed. Existing agreements and templates that use it still work. To change the wording, create a Word partial."
        />
      )}
    </PageShell>
  );
}

/**
 * Template and partial source page. The A4 editor is retired, so A4
 * templates and HTML partials are shown read-only, Word templates open in
 * the OakDoc editor and Word partials are created or replaced by upload.
 */
export function TemplateSourcePage() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  return searchParams.get('type') === 'partial'
    ? <PartialSource id={id} />
    : <TemplateSource id={id} />;
}
