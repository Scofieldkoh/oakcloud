import { WorkflowProjectDetailPage } from '@/components/workflow/project-detail-page';

export default async function WorkflowProjectDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <WorkflowProjectDetailPage projectId={id} />;
}
