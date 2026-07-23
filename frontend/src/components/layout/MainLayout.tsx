import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  LayoutDashboard,
  Bot,
  Database,
  Key,
  Settings,
  Sun,
  Moon,
  PanelLeft,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAppContext } from '@/lib/contexts/AppContext';
import { cn } from '@/lib/utils';
import logo from '@/assets/masumi_logo.png';
import type { NetworkType } from '@/lib/api/types';

const navItems = [
  { href: '/', name: 'Dashboard', icon: LayoutDashboard },
  { href: '/agents', name: 'Agents', icon: Bot },
  { href: '/sources', name: 'Sources', icon: Database },
  { href: '/api-keys', name: 'API keys', icon: Key },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { theme, setThemePreference } = useTheme();
  const { network, setNetwork, isChangingNetwork } = useAppContext();
  const [collapsed, setCollapsed] = useState(false);
  const sideBarWidth = collapsed ? 96 : 260;

  const handleNetworkChange = (next: NetworkType) => {
    if (next === network) return;
    setNetwork(next);
  };

  return (
    <div
      className="flex bg-background w-full"
      style={{
        overflowY: 'scroll',
        overflowX: 'hidden',
        position: 'fixed',
        inset: 0,
      }}
    >
      <aside
        className="fixed left-0 top-0 z-40 h-screen border-r bg-[#FAFAFA] dark:bg-[#111] transition-[width] duration-300"
        style={{ width: sideBarWidth }}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          {!collapsed ? (
            <Link href="/" className="flex items-center">
              <Image src={logo} alt="Masumi" width={140} height={36} className="h-7 w-auto" />
            </Link>
          ) : (
            <div className="w-full flex justify-center text-xs font-semibold text-brand">M</div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((v) => !v)}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className={cn('p-3', collapsed && 'px-2')}>
          {!collapsed && (
            <div className="text-xs text-muted-foreground mb-2 px-1">Network</div>
          )}
          <div className={cn('grid gap-2', collapsed ? 'grid-cols-1' : 'grid-cols-2')}>
            {(['Preprod', 'Mainnet'] as NetworkType[]).map((item) => (
              <button
                key={item}
                onClick={() => handleNetworkChange(item)}
                className={cn(
                  'rounded-md border px-2 py-2 text-xs transition-colors',
                  network === item
                    ? 'border-brand bg-brand/10 text-foreground font-semibold'
                    : 'border-border text-muted-foreground hover:bg-secondary',
                )}
                title={item}
              >
                {collapsed ? item[0] : item}
              </button>
            ))}
          </div>
        </div>

        <nav className={cn('flex flex-col gap-1 p-2', collapsed && 'items-center')}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-[#F4F4F5] dark:bg-secondary font-bold'
                    : 'hover:bg-[#F4F4F5] dark:hover:bg-secondary',
                  collapsed ? 'h-10 w-10 justify-center' : 'px-3 h-10 gap-3',
                )}
                title={collapsed ? item.name : undefined}
              >
                <Icon className="h-4 w-4" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-0 right-0 px-2 space-y-2">
          <Link
            href="/settings"
            className={cn(
              'flex items-center rounded-lg text-sm transition-colors hover:bg-[#F4F4F5] dark:hover:bg-secondary',
              router.pathname === '/settings' && 'bg-[#F4F4F5] dark:bg-secondary font-bold',
              collapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-3 h-10 gap-3',
            )}
          >
            <Settings className="h-4 w-4" />
            {!collapsed && <span>Settings</span>}
          </Link>
          <div className="border-t border-border mx-2" />
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between px-2')}>
            {!collapsed && (
              <span className="text-xs text-muted-foreground">Registry Admin</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          'flex flex-col min-h-screen w-screen transition-all duration-300',
          isChangingNetwork && 'opacity-70',
        )}
        style={{ paddingLeft: sideBarWidth }}
      >
        <main className="flex-1 relative z-10 w-full animate-content-fade-in">
          <div className="max-w-[1400px] mx-auto w-full p-8 px-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
