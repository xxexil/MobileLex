import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { lawyerApi } from '@/services/api';

interface BlockedDate {
  id: number;
  date: string;
  reason?: string;
}

interface MonthDay {
  date: number;
  fullDate: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isBlocked: boolean;
  isBooked: boolean;
  isPast: boolean;
}

const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const sheetHeight = Math.min(Dimensions.get('window').height * 0.62, 520);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockedDatesError, setBlockedDatesError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBlockedDates();
  }, []);

  const fetchBlockedDates = async () => {
    try {
      setLoading(true);
      setBlockedDatesError(null);
      const { data } = await lawyerApi.blockedDates();
      setBlockedDates(Array.isArray(data) ? data : []);
    } catch (error) {
      setBlockedDates([]);
      setBlockedDatesError('Blocked dates could not be loaded right now.');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date): MonthDay[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: MonthDay[] = [];

    // Previous month's days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dateNum = prevMonthLastDay - i;
      const fullDate = new Date(year, month - 1, dateNum);
      days.push({
        date: dateNum,
        fullDate,
        isCurrentMonth: false,
        isToday: false,
        isBlocked: isDateBlocked(fullDate),
        isBooked: false,
        isPast: fullDate < today,
      });
    }

    // Current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      const fullDate = new Date(year, month, i);
      fullDate.setHours(0, 0, 0, 0);
      days.push({
        date: i,
        fullDate,
        isCurrentMonth: true,
        isToday: fullDate.getTime() === today.getTime(),
        isBlocked: isDateBlocked(fullDate),
        isBooked: false,
        isPast: fullDate < today,
      });
    }

    // Next month's days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const fullDate = new Date(year, month + 1, i);
      days.push({
        date: i,
        fullDate,
        isCurrentMonth: false,
        isToday: false,
        isBlocked: isDateBlocked(fullDate),
        isBooked: false,
        isPast: fullDate < today,
      });
    }

    return days;
  };

  const isDateBlocked = (date: Date): boolean => {
    const dateStr = date.toISOString().split('T')[0];
    return blockedDates.some((bd) => bd.date === dateStr);
  };

  const getDayColor = (day: MonthDay): string => {
    if (day.isPast) return '#e0e0e0';
    if (day.isBlocked) return '#ef5350'; // Red
    if (day.isToday) return '#42a5f5'; // Blue
    return '#ffffff';
  };

  const getDayTextColor = (day: MonthDay): string => {
    if (day.isPast) return '#999999';
    if (day.isBlocked) return '#ffffff';
    if (day.isToday) return '#ffffff';
    return !day.isCurrentMonth ? '#cccccc' : '#000000';
  };

  const handleDayPress = (day: MonthDay) => {
    if (day.isPast) return;
    setSelectedDate(day.fullDate);
    setShowBlockModal(true);
  };

  const handleBlockDay = async () => {
    if (!selectedDate) return;

    try {
      setSubmitting(true);
      const dateStr = selectedDate.toISOString().split('T')[0];
      
      const blockData: Record<string, any> = {
        blocked_date: dateStr,
      };

      if (blockReason.trim()) {
        blockData.reason = blockReason;
      }

      await lawyerApi.addBlockedDate(blockData);
      
      Alert.alert('Success', 'Date blocked successfully');
      setShowBlockModal(false);
      setBlockReason('');
      setSelectedDate(null);
      await fetchBlockedDates();
    } catch (error) {
      console.error('Error blocking date:', error);
      Alert.alert('Error', 'Failed to block date');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblockDate = async (id: number) => {
    try {
      await lawyerApi.removeBlockedDate(id);
      Alert.alert('Success', 'Date unblocked successfully');
      await fetchBlockedDates();
    } catch (error) {
      console.error('Error unblocking date:', error);
      Alert.alert('Error', 'Failed to unblock date');
    }
  };

  const monthDays = getDaysInMonth(currentDate);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 126 }]}
      >
        <View style={[styles.headerCard, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.title}>Availability Calendar</Text>
          <Text style={styles.subtitle}>
            Tap any day to block it or add a note for a partial block.
          </Text>
          <View style={styles.monthNav}>
            <TouchableOpacity
              style={styles.monthBtn}
              onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.secondary} />
            </TouchableOpacity>
            <Text style={styles.monthYear}>
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity
              style={styles.monthBtn}
              onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            >
              <Ionicons name="chevron-forward" size={20} color={Colors.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.daysOfWeek}>
            {DAYS_OF_WEEK.map((day) => (
              <Text key={day} style={styles.dayLabel}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendar}>
            {monthDays.map((day, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  {
                    backgroundColor: getDayColor(day),
                    borderColor: day.isToday ? Colors.secondary : '#e0e0e0',
                    borderWidth: day.isToday ? 2 : 1,
                  },
                ]}
                onPress={() => handleDayPress(day)}
                disabled={day.isPast}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: getDayTextColor(day) },
                  ]}
                >
                  {day.date}
                </Text>
                {day.isBlocked && (
                  <View style={styles.blockedBanner}>
                    <Text style={styles.blockedBannerText}>Blocked</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {blockedDatesError ? (
          <View style={styles.inlineNotice}>
            <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
            <Text style={styles.inlineNoticeText}>
              {blockedDatesError} You can still review and prepare blocks on this device.
            </Text>
          </View>
        ) : null}

        <View style={styles.legendCard}>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#ef5350' }]} />
              <Text style={styles.legendText}>Blocked</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#42a5f5' }]} />
              <Text style={styles.legendText}>Booked</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#ffc107' }]} />
              <Text style={styles.legendText}>Partial block</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#e0e0e0' }]} />
              <Text style={styles.legendText}>Past</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e0e0' }]} />
              <Text style={styles.legendText}>Available</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="ban-outline" size={16} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Upcoming Blocked Schedule</Text>
              <Text style={styles.sectionSubtitle}>Dates clients cannot book.</Text>
            </View>
          </View>
          {blockedDates.length === 0 ? (
            <View style={styles.emptyScheduleBox}>
              <Ionicons name="calendar-clear-outline" size={22} color="#94A3B8" />
              <Text style={styles.emptyText}>No blocked dates</Text>
            </View>
          ) : (
            blockedDates.map((block) => {
              const blockDate = new Date(block.date);
              const dateStr = blockDate.toLocaleDateString('default', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const weekday = blockDate.toLocaleDateString('default', {
                weekday: 'long',
              });
              return (
                <View key={block.id} style={styles.blockedItem}>
                  <View style={styles.blockedDateBadge}>
                    <Text style={styles.blockedDateBadgeMonth}>
                      {blockDate.toLocaleDateString('default', { month: 'short' }).toUpperCase()}
                    </Text>
                    <Text style={styles.blockedDateBadgeDay}>{blockDate.getDate()}</Text>
                  </View>
                  <View style={styles.blockedItemContent}>
                    <Text style={styles.blockedDate}>
                      {dateStr} ({weekday})
                    </Text>
                    <Text style={styles.blockedTime}>
                      All day{block.reason ? ` - ${block.reason}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unblockButton}
                    onPress={() => handleUnblockDate(block.id)}
                  >
                    <Ionicons name="close" size={13} color="#ef5350" />
                    <Text style={styles.unblockButtonText}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Block Date Modal */}
      <Modal
        visible={showBlockModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBlockModal(false)}
      >
        <View style={styles.modalContainer}>
          <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowBlockModal(false)} />
          <View style={[styles.modalContent, { maxHeight: sheetHeight }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Block {selectedDate?.toLocaleDateString('default', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity onPress={() => setShowBlockModal(false)}>
                <Ionicons name="close" size={24} color="#000000" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Block the whole day checkbox */}
              <View style={styles.checkboxRow}>
                <View style={styles.checkbox}>
                  <Ionicons name="checkmark" size={16} color="#ffffff" />
                </View>
                <Text style={styles.checkboxLabel}>Block the whole day</Text>
              </View>

              {/* Backend limitation notice */}
              {/* Reason */}
              <View style={styles.reasonRow}>
                <Text style={styles.label}>Reason (optional)</Text>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Reason(Optional)"
                  placeholderTextColor="#999999"
                  value={blockReason}
                  onChangeText={setBlockReason}
                  multiline
                />
              </View>
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => setShowBlockModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[
                  styles.blockButton,
                  submitting && { opacity: 0.6 },
                ]}
                onPress={handleBlockDay}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.blockButtonText}>Block This Day</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2F7',
  },
  scrollContent: {
    paddingBottom: 126,
  },
  headerCard: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E6ECF5',
    shadowColor: '#1E2D4D',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#F8FAFD',
  },
  monthYear: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  monthBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarCard: {
    marginHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    paddingVertical: 14,
    paddingHorizontal: 10,
    shadowColor: '#1E2D4D',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  daysOfWeek: {
    flexDirection: 'row',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    paddingVertical: 8,
  },
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 0,
    marginBottom: 2,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    borderRadius: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '800',
  },
  blockedBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#B91C1C',
    paddingVertical: 2,
    alignItems: 'center',
  },
  blockedBannerText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 2,
    paddingVertical: 4,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#475569',
  },
  legendCard: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionCard: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 18,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E6ECF5',
    shadowColor: '#1E2D4D',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  emptyScheduleBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  inlineNotice: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  inlineNoticeText: {
    flex: 1,
    color: '#92400E',
    fontSize: 12,
    lineHeight: 16,
  },
  blockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7F7',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  blockedDateBadge: {
    width: 46,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
  },
  blockedDateBadgeMonth: {
    color: '#FEE2E2',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  blockedDateBadgeDay: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: -1,
  },
  blockedItemContent: {
    flex: 1,
  },
  blockedDate: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  blockedTime: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  blockedReason: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  unblockButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unblockButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef5350',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingTop: 12,
    flexDirection: 'column',
    overflow: 'hidden',
    marginBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
  },
  modalBody: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexGrow: 0,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ef5350',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#ef5350',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
  },
  noticeBox: {
    backgroundColor: '#f5f5f5',
    borderLeftWidth: 3,
    borderLeftColor: '#999999',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 6,
  },
  reasonRow: {
    marginBottom: 16,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#f9f9f9',
    textAlignVertical: 'top',
    height: 80,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 0,
    gap: 12,
    backgroundColor: '#FAFBFD',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 4,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D6B24C',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B88A08',
  },
  blockButton: {
    flex: 1,
    backgroundColor: '#ef5350',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 46,
    shadowColor: '#DC2626',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  blockButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
