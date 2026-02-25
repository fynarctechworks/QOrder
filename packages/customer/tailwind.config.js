/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Premium muted-green fintech palette
        background: '#F6F8F5',
        'background-secondary': '#EFF3ED',
        surface: {
          DEFAULT: '#F0F4EE',
          elevated: '#FFFFFF',
          highlight: '#F6F8F5',
          border: '#E5E7EB'
        },
        primary: {
          DEFAULT: '#1F3D36',
          hover: '#17322C',
          light: '#2A5248',
          muted: 'rgba(31, 61, 54, 0.1)',
          foreground: '#FFFFFF'
        },
        accent: '#A7D7A2',
        sidebar: '#E8F1EC',
        border: '#E5E7EB',
        muted: '#6B7280',
        success: {
          DEFAULT: '#22C55E',
          light: '#4ADE80',
          muted: 'rgba(34, 197, 94, 0.1)'
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#F87171',
          muted: 'rgba(239, 68, 68, 0.1)'
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FBBF24',
          muted: 'rgba(245, 158, 11, 0.1)'
        },
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
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.25rem' }],
        'sm': ['0.875rem', { lineHeight: '1.5rem' }],
        'base': ['1rem', { lineHeight: '1.75rem' }],
        'lg': ['1.125rem', { lineHeight: '1.875rem' }],
        'xl': ['1.25rem', { lineHeight: '2rem' }],
        '2xl': ['1.5rem', { lineHeight: '2.25rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.5rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        'safe': 'env(safe-area-inset-bottom, 16px)'
      },
      maxWidth: {
        'container': '480px',
        'container-lg': '1200px',
        'container-xl': '1400px',
      },
      width: {
        'sidebar': '280px',
      },
      borderRadius: {
        '4xl': '2rem'
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(0, 0, 0, 0.08)',
        'card': '0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
        'elevated': '0 12px 24px -4px rgba(0, 0, 0, 0.12), 0 6px 12px -4px rgba(0, 0, 0, 0.06)',
        'glow': '0 0 20px rgba(31, 61, 54, 0.25)',
        'inner-soft': 'inset 0 1px 2px rgba(0, 0, 0, 0.05)'
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'loading-pulse': 'loadingPulse 1.5s ease-in-out infinite',
        'loading-dot': 'loadingDot 0.8s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        loadingPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.1)', opacity: '1' }
        },
        loadingDot: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.3)', opacity: '1' }
        }
      },
      minHeight: {
        'touch': '48px'
      },
      minWidth: {
        'touch': '48px'
      }
    },
  },
  plugins: [],
}
