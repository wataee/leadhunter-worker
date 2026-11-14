import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0D0E12',
        surface: {
          DEFAULT: '#14161C',
          2: '#1A1D25',
          3: '#222631',
        },
        border: {
          DEFAULT: '#23262F',
          subtle: '#1C1F27',
          strong: '#323743',
        },
        text: {
          DEFAULT: '#E8E9ED',
          muted: '#8B8F9A',
          dim: '#5E6370',
        },
        muted: '#8B8F9A',
        accent: {
          DEFAULT: '#8B7CFF',
          hover: '#9B8EFF',
          soft: 'rgba(139, 124, 255, 0.14)',
          glow: 'rgba(139, 124, 255, 0.25)',
        },
        success: {
          DEFAULT: '#4ADE80',
          soft: 'rgba(74, 222, 128, 0.14)',
        },
        warning: {
          DEFAULT: '#FBBF24',
          soft: 'rgba(251, 191, 36, 0.14)',
        },
        danger: {
          DEFAULT: '#F87171',
          soft: 'rgba(248, 113, 113, 0.14)',
        },
        info: {
          DEFAULT: '#60A5FA',
          soft: 'rgba(96, 165, 250, 0.14)',
        },
        tier: {
          1: '#FBBF24',
          2: '#8B7CFF',
          3: '#8B8F9A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        card: '14px',
        control: '9px',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.25)',
        dropdown: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.85)' },
        },
        fadeInScale: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'pulse-dot': 'pulseDot 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in-scale': 'fadeInScale 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
