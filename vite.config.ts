import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Les tests portent sur la logique pure et sur le store : pas de DOM.
    // La couche de stockage retombe d'elle-même sur sa version mémoire
    // quand ni IndexedDB ni localStorage n'existent, ce qui est le cas ici.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
