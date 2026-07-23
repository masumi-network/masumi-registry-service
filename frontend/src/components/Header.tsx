import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/masumi_logo.png';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto w-full">
        <div className="h-14 px-4 flex items-center justify-between gap-4">
          <Image src={logo} alt="Masumi Logo" width={200} height={48} className="w-auto h-8" />
          <div className="flex items-center gap-2">
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
    </header>
  );
}
