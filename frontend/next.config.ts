import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  basePath: '/admin',
  env: {
    NEXT_PUBLIC_REGISTRY_API_BASE_URL:
      process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL || '/api/v1',
  },
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
};

export default nextConfig;
