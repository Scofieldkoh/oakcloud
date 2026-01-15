/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests from custom domain in development
  allowedDevOrigins: ['oakcloud.app', '*.oakcloud.app'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Turbopack and webpack configurations removed
  // Phaser requires real canvas support
  webpack: (config) => {
    // No canvas aliasing - Phaser needs real canvas
    return config;
  },
};

module.exports = nextConfig;
