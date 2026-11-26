import path from "node:path";
import { defineConfig } from "vite";
import { VERSION } from "./game/protocol.js";

export default defineConfig(({ command, isPreview }) => ({
  root: path.resolve(import.meta.dirname, "web"),
  envDir: import.meta.dirname,
  base: command === "serve" && !isPreview ? "/" : "/songen_wo_kakeyouka3/",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  plugins: [
    {
      name: "songen-protocol-version",
      transformIndexHtml() {
        return [{ tag: "meta", attrs: { name: "songen-protocol", content: String(VERSION) } }];
      },
    },
  ],
}));
