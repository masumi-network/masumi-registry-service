import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  // Express serves the export under this prefix (src/utils/admin-ui).
  basePath: '/admin',
  images: {
    unoptimized: true,
  },
  compiler: {
    // Strip console.* from production bundles but keep console.error for real failures.
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
};

export default nextConfig;
