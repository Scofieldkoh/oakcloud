import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string; contractId: string }>;
}

export default async function LegacyNewServiceRedirect({ params }: PageProps) {
  const { id: companyId, contractId } = await params;
  redirect(`/companies/${companyId}/services/new?contractId=${contractId}`);
}
