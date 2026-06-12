// fontkit is pdfkit's shaping engine — a transitive dependency we import only
// in the ligature-canary test. It ships no type declarations.
declare module 'fontkit';

// Side-effect asset imports in the UI entry (handled by Vite at build time).
// TS 6 requires declarations for these or it errors on the bare import.
declare module '*.css';
declare module '@fontsource-variable/manrope';
declare module '@fontsource-variable/jetbrains-mono';
