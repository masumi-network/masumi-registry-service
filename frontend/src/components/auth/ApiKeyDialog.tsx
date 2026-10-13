import { useRef, useState } from 'react';
import Head from 'next/head';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MasumiLogo from '@/components/MasumiLogo';
import type { AuthFailure } from '@/lib/auth/errors';
import { useAuth } from '@/lib/contexts/AuthContext';

// A key travels in an HTTP header: printable ASCII only. Anything else (smart quotes from
// pasted text, say) makes the request throw before it is sent and would read as a network
// failure, so it is caught here.
const HEADER_SAFE_KEY = /^[\x20-\x7E]+$/;

/** Full-screen sign-in: the registry has no accounts, the API key is the credential. */
export function ApiKeyDialog() {
  const { signIn, notice } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<AuthFailure | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const message = error?.message ?? notice;
  // Only a problem with the key itself marks the field invalid, not an unreachable API.
  const isKeyProblem = error !== null && error.kind !== 'unavailable';
  const key = value.trim();

  function fail(failure: AuthFailure) {
    setError(failure);
    setIsSubmitting(false);
    // The submit button was disabled while focused, which drops focus to <body>.
    inputRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (key === '' || isSubmitting) return;
    setError(null);
    if (!HEADER_SAFE_KEY.test(key)) {
      fail({
        kind: 'rejected',
        message:
          'This does not look like an API key: it has characters that cannot be sent to the API.',
      });
      return;
    }
    setIsSubmitting(true);
    const failure = await signIn(key);
    // On success the gate replaces this screen, so only a failure needs handling.
    if (failure) fail(failure);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Head>
        <title>Sign in | Masumi Registry</title>
      </Head>
      <div className="w-full max-w-md space-y-8">
        <MasumiLogo />

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Enter your API key</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the <code className="text-foreground">Admin_KEY</code> from your registry
            environment, or any API key an admin created. The key stays encrypted in this browser
            until you sign out, so do not sign in on a shared device.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <label htmlFor="api-key" className="text-sm font-medium">
            API key
          </label>
          <div className="flex gap-3">
            <Input
              ref={inputRef}
              id="api-key"
              name="api-key"
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              autoFocus
              spellCheck={false}
              required
              aria-invalid={isKeyProblem ? true : undefined}
              aria-describedby={message ? 'api-key-error' : undefined}
              className="flex-1"
            />
            <Button type="submit" disabled={isSubmitting || key === ''}>
              {isSubmitting ? 'Checking…' : 'Enter'}
            </Button>
          </div>
          {message && (
            // The theme's destructive token is a dark fill colour and unreadable as text on dark.
            <p id="api-key-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
