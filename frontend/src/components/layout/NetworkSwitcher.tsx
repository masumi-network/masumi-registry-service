'use client';

import { cn } from '@/lib/utils';
import { useAppContext } from '@/lib/contexts/AppContext';
import { Button } from '@/components/ui/button';
import type { NetworkType } from '@/lib/api/types';

interface NetworkSwitcherProps {
  collapsed: boolean;
  onNetworkChange: (network: NetworkType) => void;
}

/**
 * Matches payment admin `NetworkSourceCard` network toggle (Preprod | Mainnet).
 * Registry has no Cardano/x402 rail picker — only the environment switch.
 */
export function NetworkSwitcher({ collapsed, onNetworkChange }: NetworkSwitcherProps) {
  const { network } = useAppContext();

  const segmentClass = (active: boolean) =>
    cn(
      'font-medium hover:scale-[1.03] transition-all duration-300',
      active
        ? 'bg-[#FFFFFFD0] dark:bg-background/70 hover:bg-[#FFFFFFD0] dark:hover:bg-background/70 cursor-default hover:scale-100 is-active'
        : 'bg-[#0000000a] dark:bg-[#ffffff0a] hover:bg-[#00000014] dark:hover:bg-[#ffffff14]',
    );

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="grid grid-cols-2 p-1 bg-[#F4F4F5] dark:bg-secondary rounded-md gap-0.5">
          <Button
            variant="ghost"
            size="sm2"
            className={cn('px-2', segmentClass(network === 'Preprod'))}
            onClick={() => onNetworkChange('Preprod')}
            aria-pressed={network === 'Preprod'}
            title="Preprod"
          >
            P
          </Button>
          <Button
            variant="ghost"
            size="sm2"
            className={cn('px-2', segmentClass(network === 'Mainnet'))}
            onClick={() => onNetworkChange('Mainnet')}
            aria-pressed={network === 'Mainnet'}
            title="Mainnet"
          >
            M
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[#F4F4F5] dark:bg-secondary p-1.5 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1 mx-0.5">
        <Button
          variant="ghost"
          size="sm2"
          className={cn('flex-1 truncate', segmentClass(network === 'Preprod'))}
          onClick={() => onNetworkChange('Preprod')}
          aria-pressed={network === 'Preprod'}
        >
          Preprod
        </Button>
        <Button
          variant="ghost"
          size="sm2"
          className={cn('flex-1 truncate', segmentClass(network === 'Mainnet'))}
          onClick={() => onNetworkChange('Mainnet')}
          aria-pressed={network === 'Mainnet'}
        >
          Mainnet
        </Button>
      </div>
    </div>
  );
}
