import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the built site works from any path (GitHub Pages serves it under /ankra-orb/).
export default defineConfig({ base: './', plugins: [react()] })
