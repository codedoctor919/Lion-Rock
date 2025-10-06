import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/admin/api/:path*',
        destination: 'http://localhost:8000/admin/api/:path*',
      },
    ];
  },
};

export default nextConfig;