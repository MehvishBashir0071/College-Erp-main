import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      // Tell the Babel transform to include plain .js files
      include: /\.(js|jsx)$/,
    }),
  ],
  esbuild: {
    // Map the esbuild compiler to treat all JS/TS/JSX/TSX files as JSX
    loader: "jsx",
    include: /\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  server: {
    port: 3000,
  },
});
