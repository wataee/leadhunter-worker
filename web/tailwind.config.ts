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
        bg: '#0A0A0A',
        surface: {
          DEFAULT: '#121212',
          2: '#161616',
          3: '#1F1F1F',
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          subtle: 'rgba(255, 255, 255, 0.05)',
          strong: 'rgba(255, 255, 255, 0.16)',
        },
        text: {
          DEFAULT: '#EDEDED',
          muted: '#8A8A8A',
          dim: '#5C5C5C',
        },
        muted: '#8A8A8A',
        accent: {
          DEFAULT: '#EDEDED',
          hover: '#FFFFFF',
          soft: 'rgba(255, 255, 255, 0.06)',
          glow: 'transparent',
        },
        success: {
          DEFAULT: '#4ADE80',
          soft: 'rgba(74, 222, 128, 0.10)',
        },
        warning: {
          DEFAULT: '#FBBF24',
          soft: 'rgba(251, 191, 36, 0.10)',
        },
        danger: {
          DEFAULT: '#F87171',
          soft: 'rgba(248, 113, 113, 0.10)',
        },
        info: {
          DEFAULT: '#9CA3AF',
          soft: 'rgba(156, 163, 175, 0.10)',
        },
        tier: {
          1: '#EDEDED',
          2: '#A3A3A3',
          3: '#737373',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        card: '6px',
        control: '6px',
        DEFAULT: '6px',
      },
      boxShadow: {
        subtle: 'none',
        dropdown: '0 4px 16px rgba(0, 0, 0, 0.6)',
      },
      transitionDuration: {
        DEFAULT: '140ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
