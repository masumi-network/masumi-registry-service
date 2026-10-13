import Head from 'next/head';
import Link from 'next/link';
import { BookOpen, Home } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import MasumiLogo from '@/components/MasumiLogo';

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 - Page Not Found | Masumi Registry</title>
      </Head>
      <MainLayout>
        <section
          aria-labelledby="not-found-heading"
          className="flex min-h-[600px] flex-col items-center justify-center px-4"
        >
          <div className="max-w-lg text-center">
            <div className="mb-8 flex justify-center animate-pop-in">
              <MasumiLogo />
            </div>
            <p
              className="mb-4 text-6xl font-bold text-muted-foreground animate-scale-in-bounce opacity-0"
              style={{ animationDelay: '100ms' }}
            >
              404
            </p>
            <h1
              id="not-found-heading"
              className="mb-4 text-2xl font-semibold animate-fade-in-up opacity-0"
              style={{ animationDelay: '200ms' }}
            >
              Page Not Found
            </h1>
            <p
              className="mb-8 text-muted-foreground animate-fade-in-up opacity-0"
              style={{ animationDelay: '300ms' }}
            >
              The page you are looking for does not exist or has been moved.
            </p>
            <div
              className="flex flex-col justify-center gap-3 animate-fade-in-up opacity-0 sm:flex-row"
              style={{ animationDelay: '400ms' }}
            >
              <Button asChild size="lg">
                <Link href="/">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  Go to Dashboard
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a
                  href="https://www.masumi.network/dev/masumi"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Browse Documentation
                </a>
              </Button>
            </div>
          </div>
        </section>
      </MainLayout>
    </>
  );
}
