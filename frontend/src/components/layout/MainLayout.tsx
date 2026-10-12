import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  BookOpen,
  FileCode,
  LayoutDashboard,
  MessageSquare,
  Moon,
  PanelLeft,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import MasumiLogo from '@/components/MasumiLogo';
import MasumiIconFlat from '@/components/MasumiIconFlat';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useSidebar } from '@/lib/contexts/SidebarContext';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  href: string;
  name: string;
  icon: LucideIcon;
};

// Feature slices append their pages here.
const navItems: NavItem[] = [{ href: '/', name: 'Dashboard', icon: LayoutDashboard }];

type HeaderLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  external: boolean;
};

const headerLinks: HeaderLink[] = [
  // Swagger UI lives on the API server outside the /admin basePath, so it is a plain <a>.
  { href: '/docs', label: 'API docs', icon: FileCode, external: false },
  {
    href: 'https://www.masumi.network/dev/masumi',
    label: 'Documentation',
    icon: BookOpen,
    external: true,
  },
  {
    href: 'https://www.masumi.network/contact',
    label: 'Support',
    icon: MessageSquare,
    external: true,
  },
];

const footerLinks = [
  { href: 'https://www.masumi.network/about', label: 'About' },
  {
    href: 'https://www.house-of-communication.com/de/en/footer/privacy-policy.html',
    label: 'Privacy',
  },
  { href: 'https://www.masumi.network/product-releases', label: 'Changelog' },
];

const SIDEBAR_WIDTH = 280;
const SIDEBAR_WIDTH_COLLAPSED = 96;
const NAV_ANIMATION_MS = 1000;
const THEME_BLUR_MS = 200;

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
  const isRail = collapsed && !isHovered;
  const isFirstNavMount = !hasAnimatedNav;

  useEffect(() => {
    if (hasAnimatedNav) return;
    const timer = setTimeout(() => markNavAnimated(), NAV_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [hasAnimatedNav, markNavAnimated]);

  const applyBlurTransition = useCallback((isActive: boolean) => {
    if (!isActive) return;
    const app = document.getElementById('__next');
    if (!app) return;

    app.style.transition = 'all 0.2s ease';
    app.style.filter = 'blur(10px)';
    app.style.pointerEvents = 'none';
    app.style.scale = '1.1';

    const timer = setTimeout(() => {
      app.style.filter = '';
      app.style.pointerEvents = 'auto';
      app.style.scale = '1';
    }, THEME_BLUR_MS);

    return () => {
      clearTimeout(timer);
      app.style.filter = '';
      app.style.transition = '';
      app.style.pointerEvents = 'auto';
      app.style.scale = '1';
    };
  }, []);

  useEffect(() => applyBlurTransition(isChangingTheme), [isChangingTheme, applyBlurTransition]);

  const sidebarWidth = isRail ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <div className="fixed inset-0 flex w-full overflow-x-hidden overflow-y-scroll bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-1 focus:ring-ring"
      >
        Skip to content
      </a>
      <aside
        className="fixed left-0 top-0 z-40 h-screen border-r bg-[#FAFAFA] transition-[width] duration-300 dark:bg-[#111]"
        data-collapsed={collapsed}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        // Keyboard focus expands the rail like hover does, so the toggle stays reachable.
        onFocus={() => setIsHovered(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsHovered(false);
        }}
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="border-b border-border">
          <div
            className={cn(
              'flex h-14 shrink-0 items-center overflow-hidden px-4',
              isRail ? 'justify-center' : 'justify-between',
            )}
          >
            {isRail ? (
              <Link
                href="/"
                key="masumi-logo-icon"
                aria-label="Masumi Registry home"
                className="flex h-8 w-8 items-center justify-center"
                style={shouldAnimateIcon ? { animation: 'rotateIn 0.3s ease-out' } : undefined}
              >
                <MasumiIconFlat className="h-6 w-6" aria-hidden="true" />
              </Link>
            ) : (
              <Link href="/" key="masumi-logo-full" aria-label="Masumi Registry home">
                <MasumiLogo />
              </Link>
            )}
            {!isRail && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle sidebar"
                aria-expanded={!collapsed}
                className={cn('h-8 w-8', collapsed ? 'text-muted-foreground' : 'text-foreground')}
                onClick={() => setCollapsed(!collapsed)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <nav
          aria-label="Main navigation"
          className={cn('flex flex-col gap-1 p-2', isRail ? 'items-center px-0' : 'px-2')}
        >
          {navItems.map((item, index) => {
            const isActive = router.pathname === item.href;
            const Icon = item.icon;
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
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={isRail ? item.name : undefined}
                  title={isRail ? item.name : undefined}
                  className={cn(
                    'sidebar-active-indicator relative flex items-center rounded-lg text-sm transition-colors duration-150',
                    'hover:bg-[#F4F4F5] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring dark:hover:bg-secondary',
                    isActive && 'is-active bg-[#F4F4F5] font-bold dark:bg-secondary',
                    isRail ? 'h-10 w-10 justify-center' : 'h-10 gap-3 px-3',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {!isRail && <span className="truncate">{item.name}</span>}
                </Link>
              </div>
            );
          })}
        </nav>

        <div
          className={cn(
            'absolute bottom-4 left-0 right-0 overflow-hidden transition-all duration-300',
            isRail ? 'px-0' : 'px-2',
          )}
        >
          <div className="mx-2 mb-2 border-t border-border" />
          <div className="flex items-center justify-between px-2">
            <div
              className={cn('flex items-center text-xs text-muted-foreground', isRail && 'hidden')}
            >
              {footerLinks.map((link, index) => (
                <span key={link.href} className="flex items-center">
                  {index > 0 && <span className="mx-2 text-muted-foreground/40">|</span>}
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </span>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className={cn('h-8 w-8', isRail && 'mx-auto')}
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
        className="flex min-h-screen w-full flex-col transition-[padding] duration-300"
        style={{ paddingLeft: `${sidebarWidth}px` }}
      >
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-end gap-2 px-4 sm:gap-4">
            {headerLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Button key={link.href} variant="outline" size="sm" asChild>
                  <a
                    href={link.href}
                    aria-label={link.label}
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{link.label}</span>
                  </a>
                </Button>
              );
            })}
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 w-full flex-1 animate-content-fade-in focus:outline-hidden"
        >
          <div className="mx-auto w-full max-w-[1400px] p-8 px-4">{children}</div>
        </main>
      </div>
    </div>
  );
}
