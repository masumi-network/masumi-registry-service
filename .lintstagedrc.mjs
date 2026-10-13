export default {
  // Backend: lint and format only the staged paths lint-staged appends, so
  // unstaged work elsewhere in src/ is never rewritten.
  '{src,prisma}/**/*.{js,ts}': [
    'eslint --fix --quiet --config eslint.config.mjs',
    'prettier --log-level silent --write',
  ],
  // Frontend: run the workspace's own tools once; staged paths would be root-relative.
  'frontend/**/*.{js,jsx,mjs,ts,tsx,css,json,md}': () => [
    'pnpm -C frontend run lint:fix',
    'pnpm -C frontend run format',
  ],
};
