// Type shims for packages whose types aren't auto-resolved by the TS bundler resolver

declare module '@react-native-community/datetimepicker' {
  import type { FC } from 'react';
  import type { ViewProps } from 'react-native';

  export type EvtTypes = 'set' | 'neutralButtonPressed' | 'dismissed';

  export type DateTimePickerEvent = {
    type: EvtTypes;
    nativeEvent: {
      timestamp: number;
      utcOffset: number;
    };
  };

  export interface DateTimePickerProps extends ViewProps {
    value: Date;
    mode?: 'date' | 'time' | 'datetime' | 'countdown';
    display?: 'default' | 'spinner' | 'calendar' | 'clock' | 'compact' | 'inline';
    onChange?: (event: DateTimePickerEvent, date?: Date) => void;
    maximumDate?: Date;
    minimumDate?: Date;
    is24Hour?: boolean;
    minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
    timeZoneOffsetInMinutes?: number;
    textColor?: string;
    accentColor?: string;
    themeVariant?: 'dark' | 'light';
    disabled?: boolean;
    locale?: string;
  }

  const DateTimePicker: FC<DateTimePickerProps>;
  export default DateTimePicker;
}

declare module 'axios/dist/browser/axios.cjs' {
  const axios: typeof import('axios');
  export default axios;
}
