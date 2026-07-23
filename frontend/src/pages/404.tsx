import Head from 'next/head';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Head>
        <title>404 | Registry Admin</title>
      </Head>
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">This admin page does not exist.</p>
      <Button asChild>
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
