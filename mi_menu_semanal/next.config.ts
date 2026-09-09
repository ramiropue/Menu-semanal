import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.43.149",
    "192.168.43.149:3000",
    "192.168.1.104",
    "192.168.1.104:3000",
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
  ],
};

export default nextConfig;
