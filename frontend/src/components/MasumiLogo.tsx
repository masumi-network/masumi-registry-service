import React from 'react';
import masumiBlack from '@/assets/masumi-logo-black.svg';
import masumiWhite from '@/assets/Masumi white.svg';
import { useTheme } from '@/lib/contexts/ThemeContext';
import Image from 'next/image';
import kanjiWhite from '@/assets/Masumi kanji white.svg';
import kanjiBlack from '@/assets/Kanji.svg';

const MasumiLogo = React.memo(() => {
  const { theme } = useTheme();
  return (
    <div className="flex h-8 items-center gap-3">
      <Image
        src={theme === 'dark' ? masumiWhite : masumiBlack}
        alt="Masumi Logo"
        // The SVG's own aspect ratio (1920x679.76) at h-8, so next/image sees no resize.
        width={90}
        height={32}
        className="h-8 w-auto max-w-none"
        priority
      />
      <Image
        src={theme === 'dark' ? kanjiWhite : kanjiBlack}
        alt=""
        width={16}
        height={34}
        className="h-[34px] w-auto max-w-none"
        priority
      />
    </div>
  );
});

MasumiLogo.displayName = 'MasumiLogo';

export default MasumiLogo;
