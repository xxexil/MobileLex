import RequireRole from '@/components/RequireRole';
import LawFirmSettingsScreen from './(lawfirm)/settings';

export default function LawFirmSettingsRoute() {
  return (
    <RequireRole allowed={['law_firm']}>
      <LawFirmSettingsScreen />
    </RequireRole>
  );
}
