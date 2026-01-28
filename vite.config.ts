
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Garante que o processo entenda o process.env mesmo no navegador
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
});
