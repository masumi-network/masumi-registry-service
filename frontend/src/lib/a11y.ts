import type { KeyboardEvent } from 'react';

/**
 * Makes a non-button clickable element (e.g. a table row) keyboard-operable.
 * Spread alongside onClick. Ignores keys from nested controls.
 */
export function rowActivation(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
