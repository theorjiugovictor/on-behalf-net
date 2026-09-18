/** @type {import('next').NextConfig} */
const nextConfig = {
  // Agent state lives in process memory and every route is request-time, so
  // there is nothing here to prerender.
  reactStrictMode: true,
};

export default nextConfig;
