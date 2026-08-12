import { EsigningSignPage } from '@/components/esigning/esigning-sign-page';
import { PublicSigningProviders } from './public-signing-providers';

export default function Page() {
  return (
    <PublicSigningProviders>
      <EsigningSignPage />
    </PublicSigningProviders>
  );
}
