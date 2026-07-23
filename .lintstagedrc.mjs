export default {
  'src/**/*.{js,ts}': ['pnpm run lint', 'pnpm run format'],
  // Run full frontend lint once; do not pass staged paths (generated/*.gen.ts is ignored).
  'frontend/src/**/*.{js,ts,tsx}': () => 'pnpm run frontend:lint',
};
