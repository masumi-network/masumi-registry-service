import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAppContext, persistApiKey } from '@/lib/contexts/AppContext';
import { getApiKeyStatus } from '@/lib/api/generated';
import { cn, extractErrorMessage } from '@/lib/utils';

export function ApiKeyDialog() {
  const router = useRouter();
  const [apiKeyTMP, setApiKeyTMP] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { updateApiKey, apiClient } = useAppContext();

  const handleApiKeySubmit = async (key: string) => {
    setError('');
    setIsLoading(true);
    try {
      apiClient.setConfig({ headers: { token: key } });
      const statusResponse = await getApiKeyStatus({ client: apiClient });
      if (statusResponse.error) {
        throw statusResponse.error;
      }
      const status = statusResponse.data?.data;
      if (status?.status !== 'Active') {
        throw new Error('Invalid Key: Admin key is not active');
      }
      if (status.permission !== 'Admin') {
        throw new Error('Invalid Key: Admin permission required');
      }
      persistApiKey(key);
      updateApiKey(key);
      router.push('/');
    } catch (err) {
      setError(extractErrorMessage(err, 'Invalid Key, check the entered data'));
      localStorage.removeItem('registry_api_key');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Head>
        <title>Sign In | Registry Admin</title>
      </Head>
      <Header />
      <main className="flex flex-col items-center justify-center min-h-screen py-20">
        <h1 className="text-4xl font-bold mb-4">Enter your Admin Key</h1>
        <p className="text-sm text-muted-foreground mb-8 text-center max-w-md">
          Your admin key is needed to access the registry dashboard, manage sources, and API keys.
        </p>
        <Button variant="muted" className="text-sm mb-8 hover:underline" asChild>
          <Link
            href="https://www.masumi.network/dev/masumi/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more
          </Link>
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleApiKeySubmit(apiKeyTMP);
          }}
          className="flex flex-col items-center gap-2 w-full max-w-[500px]"
        >
          <div className="flex gap-4 items-center w-full">
            <Input
              type="password"
              value={apiKeyTMP}
              onChange={(e) => setApiKeyTMP(e.target.value)}
              placeholder="Admin Key"
              required
              className={cn(
                'flex-1 bg-transparent',
                error && 'border-destructive focus-visible:ring-destructive',
              )}
            />
            <Button type="submit" disabled={isLoading} size="lg">
              {isLoading ? 'Validating...' : 'Enter'}
            </Button>
          </div>
          {error && <p className="text-destructive text-sm self-start">{error}</p>}
        </form>
      </main>
      <Footer />
    </div>
  );
}
