import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string; contractId: string; serviceId: string }>;
}

export default async function LegacyEditServiceRedirect({ params }: PageProps) {
  const { id: companyId, serviceId } = await params;
  redirect(`/companies/${companyId}/services/${serviceId}`);
}
