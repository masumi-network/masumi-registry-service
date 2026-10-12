export default {
  // Backend: same auto-fix + format as before, with staged paths appended.
  'src/**/*.{js,ts}': ['pnpm run lint:backend:fix', 'pnpm run format:backend'],
  // Frontend: run the workspace's own tools once; staged paths would be root-relative.
  'frontend/**/*.{js,jsx,mjs,ts,tsx,css,json,md}': () => [
    'pnpm -C frontend run lint:fix',
    'pnpm -C frontend run format',
  ],
};
