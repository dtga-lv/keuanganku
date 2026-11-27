import type { NextConfig } from "next";

const config: NextConfig = {
  // tesseract.js & sharp memakai binary/worker native, jangan di-bundle
  serverExternalPackages: ["tesseract.js", "sharp"],
};
export default config;
