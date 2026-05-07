import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lawyerApi } from '@/services/api';
import { Colors } from '@/constants/theme';

type BlockedDate = {
  id: number;
  date: string;
  reason?: string | null;
};

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatMonthValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
}

function getMonthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function changeMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function getCalendarDays(value: Date) {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1);
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(value.getFullYear(), value.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function isRouteMissingError(error: any) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message ?? error?.response?.data?.error ?? '').toLowerCase();
  return status === 404 || message.includes('route') || message.includes('not found');
}

function formatLongDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function LawyerBlockedDatesCard() {
  const [loading, setLoading] = useState(true);
  const [blockedDatesLoading, setBlockedDatesLoading] = useState(false);
  const [blockingActionLoading, setBlockingActionLoading] = useState(false);
  const [featureUnavailable, setFeatureUnavailable] = useState(false);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [selectedBlockedDate, setSelectedBlockedDate] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState('');
  const [blockCalendarMonth, setBlockCalendarMonth] = useState(() => getMonthStart(new Date()));
  const [blockWholeDay, setBlockWholeDay] = useState(true);

  const loadBlockedDates = useCallback(async () => {
    setBlockedDatesLoading(true);
    try {
      const { data } = await lawyerApi.blockedDates();
      setBlockedDates(Array.isArray(data) ? data : []);
      setFeatureUnavailable(false);
    } catch (error: any) {
      if (isRouteMissingError(error)) {
        setFeatureUnavailable(true);
        setBlockedDates([]);
        return;
      }
      throw error;
    } finally {
      setBlockedDatesLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlockedDates();
  }, [loadBlockedDates]);

  useEffect(() => {
    if (!selectedBlockedDate) {
      setBlockedReason('');
      return;
    }
    const selectedEntry = blockedDates.find((entry) => entry.date === selectedBlockedDate);
    setBlockedReason(selectedEntry?.reason ?? '');
  }, [blockedDates, selectedBlockedDate]);

  const monthLabel = blockCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const calendarDays = getCalendarDays(blockCalendarMonth);
  const calendarWeeks = Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7));
  const todayKey = formatDateValue(new Date());
  const currentMonth = getMonthStart(new Date());
  const canGoPrevMonth = formatMonthValue(blockCalendarMonth) > formatMonthValue(currentMonth);
  const blockedLookup = useMemo(() => new Map(blockedDates.map((entry) => [entry.date, entry])), [blockedDates]);
  const selectedBlockedEntry = selectedBlockedDate ? blockedLookup.get(selectedBlockedDate) : undefined;

  async function saveBlockedDate() {
    if (!selectedBlockedDate) {
      Alert.alert('Select a Date', 'Choose a weekday from the calendar first.');
      return;
    }
    if (!blockWholeDay) {
      Alert.alert('Whole-Day Only', 'Mobile currently supports whole-day blocking only.');
      return;
    }

    setBlockingActionLoading(true);
    try {
      await lawyerApi.addBlockedDate({
        blocked_date: selectedBlockedDate,
        reason: blockedReason.trim() || undefined,
      });
      await loadBlockedDates();
      Alert.alert('Blocked', 'The selected date is now unavailable for clients.');
    } catch (error: any) {
      if (isRouteMissingError(error)) {
        setFeatureUnavailable(true);
        Alert.alert('Unavailable', 'Blocked dates are not available on the current backend yet.');
        return;
      }
      const errors = error?.response?.data?.errors;
      const message = errors ? Object.values(errors).flat().join('\n') : error?.response?.data?.message || 'Failed to block date.';
      Alert.alert('Error', message);
    } finally {
      setBlockingActionLoading(false);
    }
  }

  async function removeBlockedDate(id: number) {
    setBlockingActionLoading(true);
    try {
      await lawyerApi.removeBlockedDate(id);
      await loadBlockedDates();
      setSelectedBlockedDate(null);
      setBlockedReason('');
    } catch (error: any) {
      if (isRouteMissingError(error)) {
        setFeatureUnavailable(true);
        Alert.alert('Unavailable', 'Blocked dates are not available on the current backend yet.');
        return;
      }
      Alert.alert('Error', error?.response?.data?.message || 'Failed to remove blocked date.');
    } finally {
      setBlockingActionLoading(false);
    }
  }

  function confirmRemoveBlockedDate(entry: BlockedDate) {
    Alert.alert('Remove Blocked Date', `Make ${entry.date} bookable again?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeBlockedDate(entry.id) },
    ]);
  }

  function handleSelectDate(dateKey: string, day: Date) {
    setSelectedBlockedDate(dateKey);
    setBlockCalendarMonth(getMonthStart(day));
    setBlockWholeDay(true);
  }

  function clearSelection() {
    setSelectedBlockedDate(null);
    setBlockedReason('');
    setBlockWholeDay(true);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="calendar-outline" size={20} color={Colors.primaryDark} />
          <Text style={styles.cardTitle}>Availability Calendar</Text>
        </View>
        {blockedDatesLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
      </View>

      <View style={styles.headerDivider} />
      <Text style={styles.cardSubtitle}>Click on a day to block the whole date. Clients will only be able to book outside the blocked schedule.</Text>

      <View style={styles.calendarHeaderRow}>
        <TouchableOpacity
          style={[styles.calendarNavBtn, !canGoPrevMonth && styles.calendarNavBtnDisabled]}
          onPress={() => canGoPrevMonth && setBlockCalendarMonth((value) => changeMonth(value, -1))}
          disabled={!canGoPrevMonth}
        >
          <Ionicons name="chevron-back" size={18} color={canGoPrevMonth ? Colors.primaryDark : Colors.textLight} />
        </TouchableOpacity>

        <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>

        <TouchableOpacity style={styles.calendarNavBtn} onPress={() => setBlockCalendarMonth((value) => changeMonth(value, 1))}>
          <Ionicons name="chevron-forward" size={18} color={Colors.primaryDark} />
        </TouchableOpacity>
      </View>

      <View style={styles.calendarWrap}>
        <View style={styles.calendarWeekRow}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calendarWeeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.calendarGridRow}>
              {week.map((day, dayIndex) => {
                if (!day) {
                  return <View key={`empty-${weekIndex}-${dayIndex}`} style={styles.calendarCellWrap} />;
                }

                const dateKey = formatDateValue(day);
                const isPast = dateKey < todayKey;
                const isBlocked = blockedLookup.has(dateKey);
                const isSelected = dateKey === selectedBlockedDate;

                return (
                  <View key={dateKey} style={styles.calendarCellWrap}>
                    <TouchableOpacity
                      style={[
                        styles.calendarDayBtn,
                        isPast && styles.calendarDayPast,
                        isBlocked && styles.calendarDayBlocked,
                        isSelected && !isBlocked && styles.calendarDaySelected,
                        isSelected && isBlocked && styles.calendarDaySelectedBlocked,
                      ]}
                      disabled={isPast && !isBlocked}
                      onPress={() => handleSelectDate(dateKey, day)}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          isPast && styles.calendarDayTextPast,
                          !isPast && !isBlocked && styles.calendarDayTextAvailable,
                          isBlocked && styles.calendarDayTextBlocked,
                          isSelected && !isBlocked && styles.calendarDayTextSelected,
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                      {isBlocked ? (
                        <View style={styles.calendarBlockedBanner}>
                          <Text style={styles.calendarBlockedBannerText}>Blocked</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.calendarLegendRow}>
          <View style={styles.calendarLegendItem}>
            <View style={[styles.calendarLegendSwatch, styles.legendBlocked]} />
            <Text style={styles.calendarLegendText}>Blocked</Text>
          </View>
          <View style={styles.calendarLegendItem}>
            <View style={[styles.calendarLegendSwatch, styles.legendPartial]} />
            <Text style={styles.calendarLegendText}>Partial day</Text>
          </View>
          <View style={styles.calendarLegendItem}>
            <View style={[styles.calendarLegendSwatch, styles.legendPast]} />
            <Text style={styles.calendarLegendText}>Past</Text>
          </View>
          <View style={styles.calendarLegendItem}>
            <View style={[styles.calendarLegendSwatch, styles.legendAvailable]} />
            <Text style={styles.calendarLegendText}>Available</Text>
          </View>
        </View>
      </View>

      {selectedBlockedDate ? (
        <View style={styles.actionPanel}>
          <Text style={styles.actionTitle}>
            {selectedBlockedEntry ? 'Unblock ' : 'Block '}
            <Text style={styles.actionTitleAccent}>{formatLongDate(selectedBlockedDate)}</Text>
          </Text>

          <TouchableOpacity style={styles.checkboxRow} onPress={() => setBlockWholeDay((value) => !value)} activeOpacity={0.8}>
            <View style={[styles.checkboxBox, blockWholeDay && styles.checkboxBoxChecked]}>
              {blockWholeDay ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
            </View>
            <Text style={styles.checkboxLabel}>Block the whole day</Text>
          </TouchableOpacity>

          {!blockWholeDay ? <Text style={styles.helperText}>Time-range blocking is not available in mobile yet.</Text> : null}

          {!selectedBlockedEntry ? (
            <TextInput
              style={styles.reasonInput}
              value={blockedReason}
              onChangeText={setBlockedReason}
              placeholder="Reason(Optional)"
              placeholderTextColor={Colors.textLight}
            />
          ) : (
            <View style={styles.readonlyReasonBox}>
              <Text style={styles.readonlyReasonLabel}>Reason</Text>
              <Text style={styles.readonlyReasonValue}>{selectedBlockedEntry.reason || 'No reason provided.'}</Text>
            </View>
          )}

          <View style={styles.btnRow}>
            {selectedBlockedEntry ? (
              <TouchableOpacity
                style={[styles.primaryDangerBtn, blockingActionLoading && styles.btnDisabled]}
                onPress={() => confirmRemoveBlockedDate(selectedBlockedEntry)}
                disabled={blockingActionLoading}
              >
                {blockingActionLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="remove-circle-outline" size={16} color="#fff" />
                      <Text style={styles.primaryBtnText}>Unblock This Day</Text>
                    </>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.primaryDangerBtn,
                  (blockingActionLoading || !blockWholeDay) && styles.btnDisabled,
                ]}
                onPress={saveBlockedDate}
                disabled={blockingActionLoading || !blockWholeDay || loading}
              >
                {blockingActionLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="ban-outline" size={16} color="#fff" />
                      <Text style={styles.primaryBtnText}>Block This Day</Text>
                    </>}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.secondaryBtn} onPress={clearSelection} disabled={blockingActionLoading}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    marginBottom: 18,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.primaryDark },
  headerDivider: { height: 1, backgroundColor: '#E9EEF5' },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 21,
    color: '#5F7087',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  calendarNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D6DFEA',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavBtnDisabled: { opacity: 0.35 },
  calendarMonthLabel: { fontSize: 18, fontWeight: '800', color: Colors.primaryDark, minWidth: 150, textAlign: 'center' },
  calendarWrap: { paddingHorizontal: 14, paddingBottom: 18 },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 8 },
  calendarWeekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#65748B' },
  calendarGrid: { gap: 6 },
  calendarGridRow: { flexDirection: 'row' },
  calendarCellWrap: { flex: 1, paddingHorizontal: 2, paddingVertical: 2 },
  calendarDayBtn: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  calendarDayPast: { backgroundColor: '#F7F9FC' },
  calendarDayBlocked: { backgroundColor: '#E33A4A', borderColor: '#E33A4A' },
  calendarDaySelected: { borderColor: Colors.primaryDark, backgroundColor: '#FFFFFF' },
  calendarDaySelectedBlocked: { borderColor: Colors.primaryDark, borderWidth: 2 },
  calendarDayText: { fontSize: 15, fontWeight: '600', color: '#A7B4C7' },
  calendarDayTextPast: { color: '#C7D1DD', fontWeight: '500' },
  calendarDayTextAvailable: { color: Colors.primaryDark, fontWeight: '700' },
  calendarDayTextBlocked: { color: '#FFFFFF', fontWeight: '800' },
  calendarDayTextSelected: { color: Colors.primaryDark, fontWeight: '800' },
  calendarBlockedBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#B91C1C',
    paddingVertical: 2,
    alignItems: 'center',
  },
  calendarBlockedBannerText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  calendarLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 18,
    paddingTop: 8,
  },
  calendarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  calendarLegendSwatch: { width: 13, height: 13, borderRadius: 3 },
  legendBlocked: { backgroundColor: '#E33A4A' },
  legendPartial: { backgroundColor: '#FBBF24', borderWidth: 1, borderColor: '#F59E0B' },
  legendPast: { backgroundColor: '#E6EBF2' },
  legendAvailable: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CAD5E3' },
  calendarLegendText: { fontSize: 12, color: '#55657B' },
  actionPanel: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#F7F9FC',
  },
  actionTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryDark, marginBottom: 14 },
  actionTitleAccent: { color: '#E33A4A' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D0D9E6',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: { backgroundColor: '#E33A4A', borderColor: '#E33A4A' },
  checkboxLabel: { fontSize: 14, fontWeight: '700', color: Colors.primaryDark },
  helperText: { fontSize: 12, lineHeight: 18, color: '#7A889B', marginBottom: 10 },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#D6DFEA',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  readonlyReasonBox: {
    borderWidth: 1,
    borderColor: '#E1E8F0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  readonlyReasonLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: '#7B8A9D', marginBottom: 4 },
  readonlyReasonValue: { fontSize: 14, color: Colors.text },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnDisabled: { opacity: 0.65 },
  primaryDangerBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#E33A4A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    minWidth: 92,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#E3E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryBtnText: { color: '#48566B', fontSize: 14, fontWeight: '700' },
});
