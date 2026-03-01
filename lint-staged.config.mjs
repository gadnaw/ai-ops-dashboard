const config = {
  // TypeScript and JavaScript files — run ESLint fix and Prettier
  "**/*.{ts,tsx,js,jsx,mjs,cjs}": ["eslint --fix --max-warnings=0", "prettier --write"],
  // JSON, CSS, and other formatting targets — Prettier only
  "**/*.{json,css,md}": ["prettier --write"],
};

export default config;
