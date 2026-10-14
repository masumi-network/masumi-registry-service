import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type { RegistrySource } from '@/lib/api/generated';
import { NETWORKS, parseNetwork, type Network } from '@/lib/agent-filters';
import { classifyAuthError } from '@/lib/auth/errors';
import { maskSecret, validateNewSource, type SourceErrors } from '@/lib/registry-sources';
import { useAddRegistrySource, useUpdateRegistrySource } from '@/lib/queries/useRegistrySources';

interface SourceFormDialogProps {
  /** null adds a source; a source edits it. */
  source: RegistrySource | null;
  existing: readonly RegistrySource[];
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

/**
 * Adds a registry source, or edits one. The API changes only a source's note and provider
 * key; policy and network are fixed once added (remove and re-add to change them).
 */
export function SourceFormDialog({
  source,
  existing,
  open,
  onClose,
  onSaved,
}: SourceFormDialogProps) {
  const isEdit = source !== null;
  const [policyId, setPolicyId] = useState('');
  const [network, setNetwork] = useState<Network>('Preprod');
  const [providerKey, setProviderKey] = useState('');
  const [note, setNote] = useState(source?.note ?? '');
  const [errors, setErrors] = useState<SourceErrors>({});
  const add = useAddRegistrySource();
  const update = useUpdateRegistrySource();
  const mutation = isEdit ? update : add;

  async function submit() {
    if (isEdit) {
      // An empty key field keeps the stored key.
      await update.mutateAsync({
        id: source.id,
        note: note.trim() || null,
        rpcProviderApiKey: providerKey.trim() || undefined,
      });
      onSaved('Source updated');
      return;
    }
    const draft = { policyId, network, rpcProviderApiKey: providerKey, note };
    const found = validateNewSource(draft, existing);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await add.mutateAsync({
      policyId: policyId.trim().toLowerCase(),
      network,
      rpcProviderApiKey: providerKey.trim(),
      note: note.trim() || null,
    });
    onSaved(`Source added on ${network}. The next sync starts reading it.`);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent dismissible={!mutation.isPending}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit().catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit registry source' : 'Add registry source'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? `${source.network} · ${source.policyId}. Policy and network cannot change; remove and re-add the source for that.`
                : 'The registry scans this policy for agent NFTs on the chosen network.'}
            </DialogDescription>
          </DialogHeader>

          {!isEdit && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="source-network">Network</Label>
                <Select
                  value={network}
                  onValueChange={(next) => setNetwork(parseNetwork(next) ?? network)}
                >
                  <SelectTrigger id="source-network">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NETWORKS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="source-policy">Policy ID</Label>
                <Input
                  id="source-policy"
                  value={policyId}
                  onChange={(event) => setPolicyId(event.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={56}
                  aria-invalid={errors.policyId ? true : undefined}
                  aria-describedby={errors.policyId ? 'source-policy-error' : undefined}
                  className="font-mono text-xs"
                />
                <FieldError id="source-policy-error" message={errors.policyId} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="source-key">
              {isEdit ? 'New Blockfrost project key' : 'Blockfrost project key'}
            </Label>
            <Input
              id="source-key"
              type="password"
              value={providerKey}
              onChange={(event) => setProviderKey(event.target.value)}
              autoComplete="off"
              placeholder={
                isEdit
                  ? `Current ${maskSecret(source.rpcProviderApiKey)}, empty keeps it`
                  : undefined
              }
              aria-invalid={errors.rpcProviderApiKey ? true : undefined}
              aria-describedby={errors.rpcProviderApiKey ? 'source-key-error' : undefined}
            />
            <FieldError id="source-key-error" message={errors.rpcProviderApiKey} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-note">Note</Label>
            <Input
              id="source-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional, for admins"
            />
          </div>

          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {classifyAuthError(mutation.error).message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {isEdit ? 'Save changes' : 'Add source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
