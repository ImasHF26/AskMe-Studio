import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'askmeDark',
    themes: {
      askmeDark: {
        dark: true,
        colors: {
          primary: '#20f2b6',
          secondary: '#6ee7d8',
          accent: '#a7f3d0',
          background: '#03070d',
          surface: '#0b111b',
          'surface-bright': '#151f2d',
          'on-background': '#eefcf8',
          'on-surface': '#eefcf8',
          error: '#fb7185',
          info: '#38bdf8',
          success: '#34d399',
          warning: '#fbbf24'
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: '#00a878',
          secondary: '#00c2a8',
          surface: '#0f172a',
          background: '#0b1020'
        }
      },
      light: {
        colors: {
          primary: '#0ea472',
          secondary: '#0fa88f',
          surface: '#ffffff',
          background: '#f3f7f8',
          'on-background': '#0f172a',
          'on-surface': '#0f172a'
        }
      }
    }
  }
});
