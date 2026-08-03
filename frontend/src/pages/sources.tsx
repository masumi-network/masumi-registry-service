import Head from 'next/head';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RefreshButton } from '@/components/RefreshButton';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppContext } from '@/lib/contexts/AppContext';
import {
  deleteRegistrySource,
  getRegistrySource,
  patchRegistrySource,
  postRegistrySource,
  type RegistrySource,
} from '@/lib/api/generated';
import { extractErrorMessage, shortenId } from '@/lib/utils';
import type { NetworkType } from '@/lib/api/types';

type SourceForm = {
  policyId: string;
  note: string;
  rpcProviderApiKey: string;
  network: NetworkType;
};

const emptyForm: SourceForm = {
  policyId: '',
  note: '',
  rpcProviderApiKey: '',
  network: 'Preprod',
};

export default function SourcesPage() {
  const { apiClient, network } = useAppContext();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RegistrySource | null>(null);
  const [form, setForm] = useState<SourceForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<RegistrySource | null>(null);

  const sourcesQuery = useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const response = await getRegistrySource({
        client: apiClient,
        query: { limit: 50 },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await postRegistrySource({
        client: apiClient,
        body: {
          policyId: form.policyId.trim(),
          note: form.note.trim() || null,
          rpcProviderApiKey: form.rpcProviderApiKey.trim(),
          network: form.network,
        },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: () => {
      toast.success('Source created');
      setDialogOpen(false);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Create failed')),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await patchRegistrySource({
        client: apiClient,
        body: {
          id: editing!.id,
          note: form.note.trim() || null,
          ...(form.rpcProviderApiKey.trim()
            ? { rpcProviderApiKey: form.rpcProviderApiKey.trim() }
            : {}),
        },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: () => {
      toast.success('Source updated');
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Update failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRegistrySource({
        client: apiClient,
        body: { id },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: () => {
      toast.success('Source deleted');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Delete failed')),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, network });
    setDialogOpen(true);
  };

  const openEdit = (source: RegistrySource) => {
    setEditing(source);
    setForm({
      policyId: source.policyId ?? '',
      note: source.note ?? '',
      rpcProviderApiKey: '',
      network: source.network ?? 'Preprod',
    });
    setDialogOpen(true);
  };

  const sources = sourcesQuery.data?.sources ?? [];

  return (
    <MainLayout>
      <Head>
        <title>Sources | Registry Admin</title>
      </Head>
      <AnimatedPage>
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
              <p className="text-sm text-muted-foreground">
                Manage Cardano registry sources (policy IDs + Blockfrost keys)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton
                onRefresh={async () => {
                  await sourcesQuery.refetch();
                }}
                isRefreshing={sourcesQuery.isFetching}
              />
              <Button id="add-source-button" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add source
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Network</TableHead>
                  <TableHead>Policy ID</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Latest page</TableHead>
                  <TableHead>RPC key</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourcesQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-16">
                      <div className="flex justify-center">
                        <Spinner size={20} addContainer />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!sourcesQuery.isLoading && sources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        title="No registry sources yet"
                        description="Add a source to start indexing agents on Cardano."
                        action={
                          <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            Add source
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {sources.map((source) => (
                  <TableRow
                    key={source.id}
                    id={`source-${source.id}`}
                    className="hover:bg-muted/40"
                  >
                    <TableCell>
                      <Badge variant="secondary">{source.network ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortenId(source.policyId ?? '', 10)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{source.note || '—'}</TableCell>
                    <TableCell>{source.latestPage ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {source.rpcProviderApiKey
                        ? shortenId(source.rpcProviderApiKey, 4)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(source)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(source)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </AnimatedPage>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit source' : 'Add source'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update note or Blockfrost API key. Policy ID cannot change.'
                : 'Create a new registry source for a network policy.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <>
                <div className="space-y-2">
                  <Label>Network</Label>
                  <Select
                    value={form.network}
                    onValueChange={(value: NetworkType) =>
                      setForm((prev) => ({ ...prev, network: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Preprod">Preprod</SelectItem>
                      <SelectItem value="Mainnet">Mainnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="policyId">Policy ID</Label>
                  <Input
                    id="policyId"
                    value={form.policyId}
                    onChange={(e) => setForm((prev) => ({ ...prev, policyId: e.target.value }))}
                    required
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rpcKey">
                Blockfrost API key{editing ? ' (leave blank to keep)' : ''}
              </Label>
              <Input
                id="rpcKey"
                type="password"
                value={form.rpcProviderApiKey}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, rpcProviderApiKey: e.target.value }))
                }
                required={!editing}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={createMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (editing) updateMutation.mutate();
                else createMutation.mutate();
              }}
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete source?</DialogTitle>
            <DialogDescription>
              This permanently removes the registry source
              {deleteTarget?.policyId ? ` (${shortenId(deleteTarget.policyId, 8)})` : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
