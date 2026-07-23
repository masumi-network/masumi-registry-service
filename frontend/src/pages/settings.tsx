import Head from 'next/head';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppContext } from '@/lib/contexts/AppContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { shortenId } from '@/lib/utils';

export default function SettingsPage() {
  const { apiKey, network, setNetwork, signOut } = useAppContext();
  const { preference, setThemePreference } = useTheme();

  return (
    <MainLayout>
      <Head>
        <title>Settings | Registry Admin</title>
      </Head>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Theme, network, and session</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose light, dark, or follow system preference</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={preference}
              onValueChange={(value: 'light' | 'dark' | 'auto') => setThemePreference(value)}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Network</CardTitle>
            <CardDescription>Scopes Agents browse/search queries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Active network</Label>
            <Select
              value={network}
              onValueChange={(value: 'Preprod' | 'Mainnet') => setNetwork(value)}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Preprod">Preprod</SelectItem>
                <SelectItem value="Mainnet">Mainnet</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session</CardTitle>
            <CardDescription>Signed in with admin key {apiKey ? shortenId(apiKey, 6) : '—'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
