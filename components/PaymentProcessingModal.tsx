import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export interface PaymentProcessingProps {
  visible: boolean;
  paymentId: number;
  consultationCode?: string;
  lawyerName?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

interface PaymentStep {
  id: string;
  label: string;
  completed: boolean;
  error?: boolean;
}

export const PaymentProcessingModal = React.forwardRef<any, PaymentProcessingProps>(
  ({
    visible,
    paymentId,
    consultationCode,
    lawyerName,
    onSuccess,
    onError,
    onCancel,
  }, ref) => {
  const [steps, setSteps] = useState<PaymentStep[]>([
      { id: 'booking', label: 'Booking Submitted', completed: false },
      { id: 'payment', label: 'Processing Payment', completed: false },
      { id: 'confirmation', label: 'Payment Confirmed', completed: false },
    ]);

    useEffect(() => {
      if (visible) {
        setSteps([
          { id: 'booking', label: 'Booking Submitted', completed: true },
          { id: 'payment', label: 'Processing Payment', completed: false },
          { id: 'confirmation', label: 'Payment Confirmed', completed: false },
        ]);
      }
    }, [visible]);

    const updateStepStatus = (stepId: string, completed: boolean, error: boolean = false) => {
      setSteps((prev) =>
        prev.map((step) =>
          step.id === stepId ? { ...step, completed, error } : step
        )
      );
    };

    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.headerIcon}>
              <Ionicons name="card-outline" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Securing your booking</Text>
            {consultationCode && (
              <View style={styles.codePill}>
                <Text style={styles.subtitle}>Booking {consultationCode}</Text>
              </View>
            )}

            <View style={styles.stepsContainer}>
              {steps.map((step, index) => (
                <View key={step.id} style={styles.stepWrapper}>
                  <View style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepDot,
                        step.completed && styles.stepDotCompleted,
                        step.error && styles.stepDotError,
                      ]}
                    >
                      {step.error ? (
                        <Ionicons name="close" size={16} color="#fff" />
                      ) : step.completed ? (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      ) : (
                        <ActivityIndicator color="#fff" size="small" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepText,
                        step.completed && styles.stepTextCompleted,
                        step.error && styles.stepTextError,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                  {index < steps.length - 1 && <View style={styles.stepLine} />}
                </View>
              ))}
            </View>

            <Text style={styles.message}>Please keep this screen open while we confirm the payment.</Text>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={steps[steps.length - 1].completed}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
);

PaymentProcessingModal.displayName = 'PaymentProcessingModal';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 15, 30, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 20,
    width: '100%',
    maxWidth: 390,
    borderWidth: 1,
    borderColor: '#E7EDF6',
    elevation: 10,
    shadowColor: '#061224',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 23,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
  },
  codePill: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#EEF5FF',
    borderWidth: 1,
    borderColor: '#D7E7FF',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '800',
    textAlign: 'center',
  },
  stepsContainer: {
    marginVertical: 22,
  },
  stepWrapper: {
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#A9B4C5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepDotCompleted: {
    backgroundColor: '#0E8F5A',
  },
  stepDotError: {
    backgroundColor: '#B42318',
  },
  stepLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E2E8F2',
    marginLeft: 16,
    marginVertical: 2,
  },
  stepText: {
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
    fontWeight: '700',
  },
  stepTextCompleted: {
    color: '#0E8F5A',
    fontWeight: '900',
  },
  stepTextError: {
    color: '#B42318',
  },
  message: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 19,
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE5F0',
    alignItems: 'center',
    backgroundColor: '#F7FAFD',
  },
  cancelButtonText: {
    color: Colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
});
