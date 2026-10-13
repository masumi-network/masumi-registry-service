export default {
  // Backend: lint auto-fix, then format only the staged paths lint-staged appends.
  '{src,prisma}/**/*.{js,ts}': [
    'pnpm run lint:backend:fix',
    'prettier --log-level silent --write',
  ],
  // Frontend: run the workspace's own tools once; staged paths would be root-relative.
  'frontend/**/*.{js,jsx,mjs,ts,tsx,css,json,md}': () => [
    'pnpm -C frontend run lint:fix',
    'pnpm -C frontend run format',
  ],
};
