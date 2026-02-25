/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F6F8F5',
        surface: '#FFFFFF',
        'surface-elevated': '#F0F4EE',
        sidebar: '#E8F1EC',
        primary: {
          DEFAULT: '#1F3D36',
          hover: '#17322C',
          light: '#2A5248',
          foreground: '#FFFFFF'
        },
        accent: '#A7D7A2',
        success: {
          DEFAULT: '#22C55E',
          light: '#4ADE80'
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#F87171'
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FBBF24'
        },
        info: {
          DEFAULT: '#2563EB',
          light: '#3B82F6'
        },
        border: '#E5E7EB',
        muted: '#6B7280',
        text: {
          primary: '#1F2937',
          secondary: '#4B5563',
          muted: '#6B7280'
        }
      },
      fontFamily: {
        sans: ['Quicksand', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['Quicksand', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Quicksand', 'system-ui', '-apple-system', 'sans-serif']
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)'
      },
      animation: {
        'blink': 'blink 1s ease-in-out infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out'
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        }
      }
    },
  },
  plugins: [],
}
