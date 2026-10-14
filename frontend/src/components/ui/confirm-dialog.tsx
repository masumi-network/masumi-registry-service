import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Names what the action affects (MAS-615: every destructive action does). */
  description: React.ReactNode;
  /** The confirm button names the action, so it is answerable on its own. */
  confirmLabel: string;
  onConfirm: () => void;
  isLoading?: boolean;
  /** A consequence the admin ticks before the action is offered. */
  acknowledgementLabel?: string;
  /** Extra input the action needs, such as a token. */
  children?: React.ReactNode;
  /** False while that input is incomplete. */
  canConfirm?: boolean;
  /** Why the last attempt failed, shown above the buttons. */
  error?: string | null;
}

/** A destructive action's confirmation, modelled on the payment service's ConfirmDialog. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  isLoading = false,
  acknowledgementLabel,
  children,
  canConfirm = true,
  error,
}: ConfirmDialogProps) {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const isReady = canConfirm && (acknowledgementLabel === undefined || isAcknowledged);
  const close = () => {
    // A tick must not carry over to the next, different thing being confirmed.
    setIsAcknowledged(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {/* Closing mid-request would drop what the caller does when the action succeeds. */}
      <DialogContent dismissible={!isLoading}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {children}
        {acknowledgementLabel !== undefined && (
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              checked={isAcknowledged}
              onCheckedChange={(checked) => setIsAcknowledged(checked === true)}
              disabled={isLoading}
              className="mt-0.5"
            />
            <span>{acknowledgementLabel}</span>
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading || !isReady}>
            {isLoading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
