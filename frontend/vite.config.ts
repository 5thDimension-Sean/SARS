import vinext from "vinext";
import { defineConfig } from "vite";
// This checkpoint is a static frontend. No Worker, authentication, or database runtime.
export default defineConfig({ plugins: [vinext()] });
