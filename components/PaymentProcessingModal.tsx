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
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.container}>
            <Text style={styles.title}>Booking Consultation</Text>
            {consultationCode && (
              <Text style={styles.subtitle}>Booking: {consultationCode}</Text>
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

            <Text style={styles.message}>Please wait while we process your payment...</Text>

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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#1A1F2E',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 350,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    textAlign: 'center',
  },
  stepsContainer: {
    marginVertical: 24,
  },
  stepWrapper: {
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2F3E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepDotCompleted: {
    backgroundColor: '#22c55e',
  },
  stepDotError: {
    backgroundColor: '#ef4444',
  },
  stepLine: {
    width: 2,
    height: 20,
    backgroundColor: '#2A2F3E',
    marginLeft: 15,
    marginVertical: 2,
  },
  stepText: {
    fontSize: 14,
    color: '#888',
    flex: 1,
  },
  stepTextCompleted: {
    color: '#22c55e',
    fontWeight: '500',
  },
  stepTextError: {
    color: '#ef4444',
  },
  message: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#888',
    fontWeight: '500',
    fontSize: 14,
  },
});
