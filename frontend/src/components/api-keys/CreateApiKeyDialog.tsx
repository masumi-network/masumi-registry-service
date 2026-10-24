import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyButton } from '@/components/ui/copy-button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApiKey } from '@/lib/api/generated';
import { isValidUsageCredits } from '@/lib/api-keys';
import { classifyAuthError } from '@/lib/auth/errors';
import { useCreateApiKey } from '@/lib/queries/useApiKeys';

/** Creates an API key and shows its token once: the registry stores only a hash of it. */
export function CreateApiKeyDialog({ onClose }: { onClose: () => void }) {
  const [permission, setPermission] = useState<ApiKey['permission']>('User');
  const [usageLimited, setUsageLimited] = useState(false);
  const [credits, setCredits] = useState('');
  const create = useCreateApiKey();
  const creditsError =
    usageLimited && !isValidUsageCredits(credits) ? 'A whole number from 0 to 1,000,000.' : null;
  const token = create.data?.token;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/* The token exists only in this dialog, and a pending create would lose it too. */}
      <DialogContent dismissible={!token && !create.isPending}>
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>API key created</DialogTitle>
              <DialogDescription>
                Copy the token now. The registry stores only its hash, so it cannot be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 font-mono text-xs break-all">{token}</code>
              <CopyButton value={token} label="Copy API key token" />
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (creditsError) return;
              create.mutate({
                permission,
                usageLimited,
                maxUsageCredits: usageLimited ? Number(credits) : 0,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                User keys can read the registry; Admin keys can also manage sources and keys.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="key-permission">Permission</Label>
              <Select
                value={permission}
                onValueChange={(next) => setPermission(next === 'Admin' ? 'Admin' : 'User')}
              >
                <SelectTrigger id="key-permission">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="User">User</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <UsageLimitFields
              idPrefix="create-key"
              usageLimited={usageLimited}
              credits={credits}
              error={creditsError}
              onLimitedChange={setUsageLimited}
              onCreditsChange={setCredits}
            />
            {create.isError && (
              <p role="alert" className="text-sm text-destructive">
                {classifyAuthError(create.error).message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || creditsError !== null}>
                {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface UsageLimitFieldsProps {
  idPrefix: string;
  usageLimited: boolean;
  credits: string;
  error: string | null;
  onLimitedChange: (usageLimited: boolean) => void;
  onCreditsChange: (credits: string) => void;
}

/** The usage limit of a key: off, or a maximum number of credits. */
export function UsageLimitFields({
  idPrefix,
  usageLimited,
  credits,
  error,
  onLimitedChange,
  onCreditsChange,
}: UsageLimitFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-limited`}
          checked={usageLimited}
          onCheckedChange={(checked) => onLimitedChange(checked === true)}
        />
        <Label htmlFor={`${idPrefix}-limited`} className="font-normal">
          Limit usage credits
        </Label>
      </div>
      {usageLimited && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-credits`}>Maximum credits</Label>
          <Input
            id={`${idPrefix}-credits`}
            inputMode="numeric"
            value={credits}
            onChange={(event) => onCreditsChange(event.target.value.trim())}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${idPrefix}-credits-error` : undefined}
          />
          {error && (
            <p id={`${idPrefix}-credits-error`} className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
