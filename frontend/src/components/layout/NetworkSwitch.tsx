import { Button } from '@/components/ui/button';
import { NETWORKS } from '@/lib/agent-filters';
import { useNetwork } from '@/lib/contexts/NetworkContext';
import { cn } from '@/lib/utils';

/** Preprod / Mainnet toggle in the sidebar, styled after the payment service's. */
export function NetworkSwitch({ compact }: { compact: boolean }) {
  const { network, setNetwork } = useNetwork();

  return (
    <div
      role="group"
      aria-label="Network"
      className={cn(
        'grid grid-cols-2 gap-0.5 rounded-md bg-[#F4F4F5] p-1 dark:bg-secondary',
        !compact && 'w-full gap-1',
      )}
    >
      {NETWORKS.map((option) => {
        const isActive = option === network;
        return (
          <Button
            key={option}
            variant="ghost"
            size="sm2"
            aria-pressed={isActive}
            // The rail shows only the initial; the name stays available to assistive tech.
            aria-label={compact ? option : undefined}
            title={compact ? option : undefined}
            onClick={() => setNetwork(option)}
            className={cn(
              'px-2 font-medium',
              isActive
                ? 'cursor-default bg-white/80 hover:bg-white/80 dark:bg-background/70 dark:hover:bg-background/70'
                : 'bg-black/5 text-muted-foreground hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10',
            )}
          >
            {compact ? option[0] : option}
          </Button>
        );
      })}
    </div>
  );
}
