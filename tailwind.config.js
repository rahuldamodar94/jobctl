import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/ui/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      // Token colors are driven by CSS variables (channels) in styles.css, so
      // Tailwind opacity modifiers (bg-surface/60) keep working and a light
      // theme could be added later by swapping :root variables.
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        faint: 'rgb(var(--text-faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent) / 0.14)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Manrope Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.4), 0 1px 3px rgb(0 0 0 / 0.3)',
        raised: '0 4px 16px -2px rgb(0 0 0 / 0.5), 0 2px 6px -2px rgb(0 0 0 / 0.4)',
        pop: '0 12px 40px -8px rgb(0 0 0 / 0.6), 0 4px 12px -4px rgb(0 0 0 / 0.5)',
        'glow-accent': '0 0 0 1px rgb(var(--accent) / 0.4), 0 6px 24px -6px rgb(var(--accent) / 0.35)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-dot': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-up': 'fade-up 0.25s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.16s cubic-bezier(0.16,1,0.3,1)',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [typography],
};
