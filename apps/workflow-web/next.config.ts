import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Mark Dapr packages as external to prevent Edge runtime bundling issues
  serverExternalPackages: ['@dapr/dapr', '@workflow-worlds/dapr'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Headers for self-hosting behind nginx reverse proxy
  async headers() {
    return [
      {
        // Enable streaming by disabling nginx buffering
        source: '/:path*',
        headers: [
          {
            key: 'X-Accel-Buffering',
            value: 'no',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
