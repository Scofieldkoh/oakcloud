/** @type {import('next').NextConfig} */
const nextConfig = {
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
