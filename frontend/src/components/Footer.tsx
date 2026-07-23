import { useTheme } from '@/lib/contexts/ThemeContext';

export function Footer() {
  const { theme, setThemePreference } = useTheme();

  return (
    <footer className="fixed bottom-0 left-0 right-0 p-4 flex justify-center items-center bg-background/80 backdrop-blur-md border-t">
      <div className="max-w-[1400px] mx-auto w-full flex justify-between items-center">
        <div className="flex gap-4">
          <a
            href="https://www.masumi.network/about"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            About
          </a>
          <a
            href="https://www.house-of-communication.com/de/en/footer/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Privacy Policy
          </a>
        </div>
        <button
          onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
          className="text-sm text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </footer>
  );
}
