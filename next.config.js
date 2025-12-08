/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests from custom domain in development
  allowedDevOrigins: ['oakcloud.app', '*.oakcloud.app'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.js',
    },
  },
  webpack: (config) => {
    // Fallback for non-Turbopack builds
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
