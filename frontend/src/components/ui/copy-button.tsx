import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';

interface CopyButtonProps {
  value: string;
  /** What is copied, for screen readers: "Copy asset identifier". */
  label: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Denied permission or an insecure context.
      toast.error('Failed to copy to clipboard');
      return;
    }
    setHasCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={() => void handleCopy()}
      type="button"
      aria-label={hasCopied ? 'Copied to clipboard' : `Copy ${label}`}
      title={`Copy ${label}`}
    >
      {hasCopied ? <Check className="text-green-500" /> : <Copy />}
    </Button>
  );
}
