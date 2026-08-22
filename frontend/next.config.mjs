/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type errors still fail the build; we only skip lint-only failures here.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
