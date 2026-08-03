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
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { RefreshButton } from '@/components/RefreshButton';
import { Spinner } from '@/components/ui/spinner';
import { CopyButton } from '@/components/ui/copy-button';
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
  deleteApiKey,
  getApiKey,
  patchApiKey,
  postApiKey,
  type ApiKey,
} from '@/lib/api/generated';
import { extractErrorMessage, shortenId } from '@/lib/utils';

type Permission = ApiKey['permission'];
type APIKeyStatus = ApiKey['status'];

export default function ApiKeysPage() {
  const { apiClient } = useAppContext();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission>('User');
  const [usageLimited, setUsageLimited] = useState(false);
  const [maxUsageCredits, setMaxUsageCredits] = useState(0);

  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [editToken, setEditToken] = useState('');
  const [editUsageLimited, setEditUsageLimited] = useState(false);
  const [editMaxCredits, setEditMaxCredits] = useState(0);
  const [editStatus, setEditStatus] = useState<APIKeyStatus>('Active');

  const [deleteKey, setDeleteKey] = useState<ApiKey | null>(null);
  const [deleteToken, setDeleteToken] = useState('');

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const response = await getApiKey({
        client: apiClient,
        query: { limit: 50 },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await postApiKey({
        client: apiClient,
        body: {
          permission,
          usageLimited,
          maxUsageCredits: usageLimited ? maxUsageCredits : 0,
        },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: (data) => {
      toast.success('API key created');
      setCreatedToken(data?.token ?? null);
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Create failed')),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await patchApiKey({
        client: apiClient,
        body: {
          token: editToken.trim(),
          usageLimited: editUsageLimited,
          maxUsageCredits: editUsageLimited ? editMaxCredits : 0,
          status: editStatus,
        },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: () => {
      toast.success('API key updated');
      setEditKey(null);
      setEditToken('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Update failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await deleteApiKey({
        client: apiClient,
        body: { token: deleteToken.trim() },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    onSuccess: () => {
      toast.success('API key deleted');
      setDeleteKey(null);
      setDeleteToken('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Delete failed')),
  });

  const keys = keysQuery.data?.apiKeys ?? [];

  return (
    <MainLayout>
      <Head>
        <title>API Keys | Registry Admin</title>
      </Head>
      <AnimatedPage>
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
              <p className="text-sm text-muted-foreground">
                Tokens are shown once on create. Update/delete require the plaintext token.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RefreshButton
                onRefresh={async () => {
                  await keysQuery.refetch();
                }}
                isRefreshing={keysQuery.isFetching}
              />
              <Button
                id="add-api-key-button"
                onClick={() => {
                  setCreatedToken(null);
                  setPermission('User');
                  setUsageLimited(false);
                  setMaxUsageCredits(0);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Create key
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keysQuery.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-16">
                      <div className="flex justify-center">
                        <Spinner size={20} addContainer />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!keysQuery.isLoading && keys.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        title="No API keys yet"
                        description="Create a key to grant access to the registry API."
                        action={
                          <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="h-4 w-4" />
                            Create key
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {keys.map((key) => (
                  <TableRow
                    key={key.id}
                    id={`api-key-${key.id}`}
                    className="hover:bg-muted/40"
                  >
                    <TableCell className="font-mono text-xs">{shortenId(key.id, 8)}</TableCell>
                    <TableCell>
                      <Badge variant={key.permission === 'Admin' ? 'default' : 'secondary'}>
                        {key.permission}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.status === 'Active' ? 'success' : 'destructive'}>
                        {key.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {key.usageLimited
                        ? `${key.accumulatedUsageCredits ?? 0} / ${key.maxUsageCredits ?? 0}`
                        : `${key.accumulatedUsageCredits ?? 0} (unlimited)`}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditKey(key);
                            setEditToken('');
                            setEditUsageLimited(key.usageLimited);
                            setEditMaxCredits(key.maxUsageCredits ?? 0);
                            setEditStatus(key.status);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setDeleteKey(key);
                            setDeleteToken('');
                          }}
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

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreatedToken(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdToken ? 'API key created' : 'Create API key'}</DialogTitle>
            <DialogDescription>
              {createdToken
                ? 'Copy this token now. It will not be shown again.'
                : 'Choose permission and optional usage limits.'}
            </DialogDescription>
          </DialogHeader>
          {createdToken ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs break-all relative pr-12">
                {createdToken}
                <div className="absolute right-2 top-2">
                  <CopyButton value={createdToken} />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Permission</Label>
                <Select
                  value={permission}
                  onValueChange={(value: Permission) => setPermission(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="User">User</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="usageLimited">Usage limited</Label>
                <Switch
                  id="usageLimited"
                  checked={usageLimited}
                  onCheckedChange={setUsageLimited}
                />
              </div>
              {usageLimited && (
                <div className="space-y-2">
                  <Label htmlFor="maxCredits">Max usage credits</Label>
                  <Input
                    id="maxCredits"
                    type="number"
                    min={0}
                    value={maxUsageCredits}
                    onChange={(e) => setMaxUsageCredits(Number(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {createdToken ? 'Close' : 'Cancel'}
            </Button>
            {!createdToken && (
              <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                Create
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editKey} onOpenChange={(open) => !open && setEditKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update API key</DialogTitle>
            <DialogDescription>
              Paste the plaintext token for key {editKey ? shortenId(editKey.id, 6) : ''}. Tokens
              are hashed at rest and not returned by list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="editToken">API key token</Label>
              <Input
                id="editToken"
                type="password"
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
                placeholder="masumi-registry-…"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editStatus}
                onValueChange={(value: APIKeyStatus) => setEditStatus(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="editUsage">Usage limited</Label>
              <Switch
                id="editUsage"
                checked={editUsageLimited}
                onCheckedChange={setEditUsageLimited}
              />
            </div>
            {editUsageLimited && (
              <div className="space-y-2">
                <Label htmlFor="editMax">Max usage credits</Label>
                <Input
                  id="editMax"
                  type="number"
                  min={0}
                  value={editMaxCredits}
                  onChange={(e) => setEditMaxCredits(Number(e.target.value) || 0)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKey(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editToken.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteKey} onOpenChange={(open) => !open && setDeleteKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API key?</DialogTitle>
            <DialogDescription>
              Paste the plaintext token to confirm deletion of{' '}
              {deleteKey ? shortenId(deleteKey.id, 6) : 'this key'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="deleteToken">API key token</Label>
            <Input
              id="deleteToken"
              type="password"
              value={deleteToken}
              onChange={(e) => setDeleteToken(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteKey(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteToken.trim() || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
