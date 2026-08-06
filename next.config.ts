import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Google OAuth profile photo
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Supabase Storage public avatar URLs (cloud project + local dev stack)
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
    ],
  },
};

export default nextConfig;
