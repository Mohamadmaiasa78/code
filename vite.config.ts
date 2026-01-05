import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Fix: Property 'cwd' does not exist on type 'Process' in certain TypeScript environments
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    server: {
      port: 3000,
    },
  };
});