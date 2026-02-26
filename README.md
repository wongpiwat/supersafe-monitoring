## SuperSafe Monitoring

AI-powered threat detection with home security cameras — built for privacy.

SuperSafe Monitoring is a privacy-first multimodal AI prototype that turns a webcam or home
security camera into a lightweight, real-time threat detection agent. Live video is processed
locally in the browser; sampled frames are sent to the Venice API for AI analysis and converted
into minimal, structured metadata (for example: “Unknown person detected near front door”).

The UI is built with **React**, **Vite**, and **Tailwind CSS**, and uses Venice&apos;s
OpenAI-compatible API for vision:

- Venice docs: [`https://docs.venice.ai/overview/about-venice`](https://docs.venice.ai/overview/about-venice)

### Preview

<img width="400" alt="Image" src="https://github.com/user-attachments/assets/52d0f3c5-43cc-4234-9c8d-58b781ecc4d6" />


### Getting started

1. Install dependencies:

   ```bash
   yarn
   ```

2. Create a local `.env` file (not committed to git) and add your Venice API key:

   ```bash
   VITE_VENICE_API_KEY=your_venice_api_key_here
   ```

3. Run the dev server:

   ```bash
   yarn dev
   ```

4. Open the app in your browser, allow camera access when prompted, and click **Start Monitoring**
   to begin sampled frame analysis via Venice vision models.

Your home. Your data. Your control.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
