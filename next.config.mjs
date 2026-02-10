/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['googleapis'],
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
