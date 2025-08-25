import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from "vite-plugin-svgr";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    viteStaticCopy({
      targets: [
        {
          src: "../../node_modules/bootstrap/dist/*",
          dest: "themes/bootstrap/default",
        },
        {
          src: "../../node_modules/bootswatch/dist/*",
          dest: "themes/bootswatch",
        },
        {
          src: "assets/images/*",
          dest: "assets/images"
        }
      ]
    })
  ],
  root: 'src/web',
  build: {
    outDir: '../../dist/web'
  }
});