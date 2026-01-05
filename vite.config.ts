
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Laad de omgevingsvariabelen uit de huidige werkmap (inclusief .env.local).
  // Het derde argument '' zorgt ervoor dat alle variabelen worden geladen, niet alleen die met VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    define: {
      // Mapt de variabele zoals gevraagd door de gebruiker naar de variabele die de SDK verwacht.
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY),
    },
    server: {
      port: 3000,
    },
  };
});
