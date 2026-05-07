import * as Linking from 'expo-linking';

export default {
  prefixes: ['lexconnectmobile://', 'https://yourapp.com'],
  config: {
    screens: {
      '(auth)': {
        screens: {
          login: 'login',
          register: 'register',
          'verify-reset': 'verify-reset',
          'reset-password': 'reset-password',
        },
      },
      '(client)': {
        screens: {
          index: 'client',
          consultations: 'client/consultations',
          'consultation-detail': 'client/consultations/:id',
          lawyers: 'client/lawyers',
          messages: 'client/messages',
          payments: 'client/payments',
          profile: 'client/profile',
        },
      },
      '(lawyer)': {
        screens: {
          index: 'lawyer',
          consultations: 'lawyer/consultations',
          earnings: 'lawyer/earnings',
          messages: 'lawyer/messages',
          profile: 'lawyer/profile',
        },
      },
      '(tabs)': {
        screens: {
          index: 'tabs',
          explore: 'explore',
        },
      },
      modal: 'modal',
      ResetPassword: 'reset',
    },
  },
};
