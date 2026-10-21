import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Only the antd vendor chunk (1,151 kB, 354 kB gzip) exceeds 500 kB; fine: it stays cached across deploys.
    chunkSizeWarningLimit: 1200,
    // Vite 8 bundles with Rolldown: `rolldownOptions` / `codeSplitting` are
    // the current names for `rollupOptions` / `manualChunks` (both deprecated).
    rolldownOptions: {
      output: {
        // Vendor code in a few named chunks. Their hash changes only when a
        // dependency is upgraded or the app starts using more of it, so
        // browsers keep them cached across ordinary deploys.
        // Groups are applied in order and each also takes the dependencies
        // of what it matches (e.g. antd pulls in its rc-* packages).
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: "antd", test: /node_modules[\\/](antd|@ant-design[\\/]icons)[\\/]/ },
            { name: "refine", test: /node_modules[\\/](@refinedev[\\/][^\\/]+|@tanstack[\\/]react-query)[\\/]/ },
          ],
        },
      },
    },
  },
});
