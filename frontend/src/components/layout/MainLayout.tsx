import { Button } from '@/components/ui/button';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Bot,
  Database,
  Key,
  Settings,
  Sun,
  Moon,
  BookOpen,
  PanelLeft,
  Search,
  MessageSquare,
} from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useSidebar } from '@/lib/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/lib/contexts/AppContext';
import MasumiLogo from '@/components/MasumiLogo';
import MasumiIconFlat from '@/components/MasumiIconFlat';
import { NetworkSwitcher } from '@/components/layout/NetworkSwitcher';
import type { NetworkType } from '@/lib/api/types';

interface MainLayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  href: string;
  name: string;
  icon: React.ReactNode;
  group: number;
};

const navItems: NavItem[] = [
  {
    href: '/',
    name: 'Dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    group: 0,
  },
  {
    href: '/agents',
    name: 'Agents',
    icon: <Bot className="h-4 w-4" />,
    group: 0,
  },
  {
    href: '/sources',
    name: 'Sources',
    icon: <Database className="h-4 w-4" />,
    group: 0,
  },
  {
    href: '/api-keys',
    name: 'API keys',
    icon: <Key className="h-4 w-4" />,
    group: 1,
  },
];

export function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const { theme, setThemePreference, isChangingTheme } = useTheme();
  const {
    collapsed,
    setCollapsed,
    isHovered,
    setIsHovered,
    shouldAnimateIcon,
    hasAnimatedNav,
    markNavAnimated,
  } = useSidebar();
  const sideBarWidth = 280;
  const sideBarWidthCollapsed = 96;
  const [isMac, setIsMac] = useState(false);
  const { network, setNetwork, isChangingNetwork } = useAppContext();
  const isFirstNavMount = !hasAnimatedNav;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      queueMicrotask(() => setIsMac(window.navigator.userAgent.includes('Macintosh')));
    }
  }, []);

  useEffect(() => {
    if (!hasAnimatedNav) {
      const timer = setTimeout(() => markNavAnimated(), 1000);
      return () => clearTimeout(timer);
    }
  }, [hasAnimatedNav, markNavAnimated]);

  const applyBlurTransition = useCallback((isActive: boolean) => {
    if (!isActive) return;
    const app = document.getElementById('__next');
    if (!app) return;

    app.style.transition = 'all 0.2s ease';
    app.style.filter = 'blur(10px)';
    app.style.pointerEvents = 'none';
    app.style.opacity = '1';
    app.style.scale = '1.1';

    const timer = setTimeout(() => {
      app.style.filter = '';
      app.style.pointerEvents = 'auto';
      app.style.opacity = '1';
      app.style.scale = '1';
    }, 200);

    return () => {
      clearTimeout(timer);
      const el = document.getElementById('__next');
      if (el) {
        el.style.filter = '';
        el.style.transition = '';
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
        el.style.scale = '1';
      }
    };
  }, []);

  useEffect(() => applyBlurTransition(isChangingTheme), [isChangingTheme, applyBlurTransition]);
  useEffect(() => applyBlurTransition(isChangingNetwork), [isChangingNetwork, applyBlurTransition]);

  const handleNetworkChange = (newNetwork: NetworkType) => {
    if (newNetwork === network) return;
    setNetwork(newNetwork);
  };

  return (
    <div
      className="flex bg-background w-full"
      style={{
        overflowY: 'scroll',
        overflowX: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r transition-[width] duration-300',
          'bg-[#FAFAFA] dark:bg-[#111]',
        )}
        data-collapsed={collapsed}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: collapsed && !isHovered ? `${sideBarWidthCollapsed}px` : `${sideBarWidth}px`,
          pointerEvents: 'auto',
        }}
      >
        <div className="flex flex-col">
          {/* Border on the wrapper (like the main sticky header) so h-14 + 1px border matches. */}
          <div className="border-b border-border">
            <div
              className={cn(
                'flex h-14 shrink-0 items-center px-4',
                collapsed && !isHovered ? 'justify-center' : 'justify-between',
              )}
            >
              {!(collapsed && !isHovered) ? (
                <Link href="/" key="masumi-logo-full">
                  <MasumiLogo />
                </Link>
              ) : (
                <Link
                  href="/"
                  key="masumi-logo-icon"
                  className="flex items-center justify-center w-8 h-8"
                  style={
                    shouldAnimateIcon && collapsed && !isHovered
                      ? {
                          animation: 'rotateIn 0.3s ease-out',
                        }
                      : undefined
                  }
                >
                  <MasumiIconFlat className="w-6 h-6" />
                </Link>
              )}
              {!(collapsed && !isHovered) && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  className={cn(
                    'h-8 w-8',
                    collapsed ? 'text-muted-foreground opacity-50' : 'text-foreground opacity-100',
                  )}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  <PanelLeft className={cn('h-4 w-4 transition-transform duration-300')} />
                </Button>
              )}
            </div>
          </div>

          <div
            className={cn('p-2 w-full', collapsed && !isHovered ? 'flex justify-center' : 'px-2')}
          >
            <NetworkSwitcher
              collapsed={collapsed && !isHovered}
              onNetworkChange={handleNetworkChange}
            />
          </div>
        </div>

        <nav
          className={cn(
            'flex flex-col gap-1 p-2',
            collapsed && !isHovered ? 'px-0 items-center' : 'px-2',
          )}
        >
          {navItems.map((item, index) => {
            const isActive = router.pathname === item.href;
            const showSeparator = index > 0 && item.group !== navItems[index - 1].group;
            return (
              <div
                key={item.href}
                className={isFirstNavMount ? 'animate-fade-in-up opacity-0' : undefined}
                style={
                  isFirstNavMount
                    ? { animationDelay: `${300 + Math.min(index, 7) * 40}ms` }
                    : undefined
                }
              >
                {showSeparator && (
                  <div
                    className={cn(
                      'my-1.5',
                      collapsed && !isHovered ? 'mx-1' : 'mx-2',
                      'border-t border-border',
                    )}
                  />
                )}
                <Link
                  href={item.href}
                  onMouseEnter={() => {
                    if (item.href.startsWith('/')) void router.prefetch(item.href);
                  }}
                  className={cn(
                    'flex items-center rounded-lg text-sm transition-colors duration-150 relative sidebar-active-indicator',
                    'hover:bg-[#F4F4F5] dark:hover:bg-secondary',
                    isActive && 'bg-[#F4F4F5] dark:bg-secondary font-bold is-active',
                    collapsed && !isHovered ? 'h-10 w-10 justify-center' : 'px-3 h-10 gap-3',
                  )}
                  title={collapsed && !isHovered ? item.name : undefined}
                >
                  {item.icon}
                  {!(collapsed && !isHovered) && <span className="truncate">{item.name}</span>}
                </Link>
              </div>
            );
          })}
        </nav>

        <div
          className={cn(
            'absolute bottom-4 left-0 right-0 overflow-hidden transition-all duration-300',
            collapsed && !isHovered ? 'px-0' : 'px-2',
          )}
        >
          <div className={cn('mb-2', collapsed && !isHovered ? 'flex justify-center' : '')}>
            <Link
              href="/settings"
              className={cn(
                'flex items-center rounded-lg text-sm transition-colors duration-150 relative sidebar-active-indicator',
                'hover:bg-[#F4F4F5] dark:hover:bg-secondary',
                router.pathname === '/settings' &&
                  'bg-[#F4F4F5] dark:bg-secondary font-bold is-active',
                collapsed && !isHovered ? 'h-10 w-10 justify-center' : 'px-3 h-10 gap-3',
              )}
              title={collapsed && !isHovered ? 'Settings' : undefined}
            >
              <Settings className="h-4 w-4" />
              {!(collapsed && !isHovered) && <span className="truncate">Settings</span>}
            </Link>
          </div>
          <div className="border-t border-border mx-2 mb-2" />
          <div className="flex items-center justify-between px-2">
            <div
              className={cn(
                'flex items-center gap-0 text-xs text-muted-foreground',
                collapsed && !isHovered && 'hidden',
              )}
            >
              <Link
                href="https://www.masumi.network/about"
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-foreground transition-colors"
              >
                About
              </Link>
              <span className="mx-2 text-muted-foreground/40">|</span>
              <Link
                href="https://www.house-of-communication.com/de/en/footer/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <span className="mx-2 text-muted-foreground/40">|</span>
              <Link
                href="https://www.masumi.network/product-releases"
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-foreground transition-colors"
              >
                Changelog
              </Link>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className={cn('h-8 w-8', collapsed && !isHovered && 'mx-auto')}
              onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <Sun key="sun" className="h-4 w-4 animate-pop-in" />
              ) : (
                <Moon key="moon" className="h-4 w-4 animate-pop-in" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      <div
        className="flex flex-col min-h-screen w-screen transition-all duration-300"
        style={{
          paddingLeft: collapsed && !isHovered ? `${sideBarWidthCollapsed}px` : `${sideBarWidth}px`,
        }}
      >
        <div className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="max-w-[1400px] mx-auto w-full">
            <div className="h-14 px-4 flex items-center justify-between gap-4">
              <div
                className="flex flex-1 max-w-[190px] justify-start gap-1 relative rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background items-center text-muted-foreground"
                title="Global search is not available in registry admin yet"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <div className="pl-2">{`Search... `}</div>
                <div className="pl-4 opacity-60">{`(${isMac ? '⌘' : 'Ctrl'} + K)`}</div>
              </div>

              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href="https://www.masumi.network/dev/masumi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <BookOpen className="h-4 w-4" />
                    Documentation
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href="https://www.masumi.network/contact"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Support
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 relative z-10 w-full animate-content-fade-in">
          <div className="max-w-[1400px] mx-auto w-full p-8 px-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
