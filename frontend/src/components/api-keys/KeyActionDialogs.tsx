import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ApiKey } from '@/lib/api/generated';
import { describeApiKey, isValidUsageCredits } from '@/lib/api-keys';
import { classifyAuthError } from '@/lib/auth/errors';
import { TokenMismatchError, useUpdateApiKey } from '@/lib/queries/useApiKeys';
import { UsageLimitFields } from './CreateApiKeyDialog';

/**
 * The registry changes a key only by its token, which it never shows after creation. The
 * field asks for it, and useUpdateApiKey checks it belongs to this key before acting.
 */
function TokenField({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="key-token">This key&apos;s token</Label>
      <Input
        id="key-token"
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-describedby="key-token-hint"
        className="font-mono text-xs"
      />
      <p id="key-token-hint" className="text-xs text-muted-foreground">
        The registry identifies keys by token, not by ID. It is checked against this key before
        anything changes.
      </p>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof TokenMismatchError ? error.message : classifyAuthError(error).message;
}

interface KeyDialogProps {
  apiKey: ApiKey;
  /** The key this session is signed in with: revoking it ends the session. */
  isSessionKey: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function RevokeKeyDialog({ apiKey, isSessionKey, onClose, onDone }: KeyDialogProps) {
  const [token, setToken] = useState('');
  const update = useUpdateApiKey();
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Revoke API key?"
      description={
        <>
          <p>
            Revokes the{' '}
            <span className="font-medium text-foreground">{describeApiKey(apiKey)}</span>. Every
            request made with it is refused from now on. Its usage and limit are kept.
          </p>
          {isSessionKey && (
            <p className="font-medium text-destructive">
              This is the key you are signed in with: revoking it signs you out.
            </p>
          )}
        </>
      }
      confirmLabel="Revoke key"
      canConfirm={token.trim() !== ''}
      isLoading={update.isPending}
      error={update.isError ? errorMessage(update.error) : null}
      onConfirm={() =>
        update.mutate(
          { key: apiKey, token, change: { status: 'Revoked' } },
          { onSuccess: () => onDone('API key revoked') },
        )
      }
    >
      <TokenField value={token} onChange={setToken} />
    </ConfirmDialog>
  );
}

export function UsageLimitDialog({
  apiKey,
  onClose,
  onDone,
}: Omit<KeyDialogProps, 'isSessionKey'>) {
  const [token, setToken] = useState('');
  const [usageLimited, setUsageLimited] = useState(apiKey.usageLimited);
  const [credits, setCredits] = useState(
    apiKey.usageLimited ? String(apiKey.maxUsageCredits ?? 0) : '',
  );
  const update = useUpdateApiKey();
  const creditsError =
    usageLimited && !isValidUsageCredits(credits) ? 'A whole number from 0 to 1,000,000.' : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent dismissible={!update.isPending}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (creditsError || !token.trim()) return;
            update.mutate(
              {
                key: apiKey,
                token,
                change: { usageLimited, maxUsageCredits: usageLimited ? Number(credits) : 0 },
              },
              { onSuccess: () => onDone('Usage limit updated') },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Usage limit</DialogTitle>
            <DialogDescription>{describeApiKey(apiKey)}</DialogDescription>
          </DialogHeader>
          <UsageLimitFields
            idPrefix="edit-key"
            usageLimited={usageLimited}
            credits={credits}
            error={creditsError}
            onLimitedChange={setUsageLimited}
            onCreditsChange={setCredits}
          />
          <TokenField value={token} onChange={setToken} />
          {update.isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(update.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={update.isPending || creditsError !== null || !token.trim()}
            >
              {update.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Save limit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
