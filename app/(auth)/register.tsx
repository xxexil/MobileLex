import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AppButton from '@/components/AppButton';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi } from '@/services/api';
import { useAuth } from '@/context/auth';
import { Colors } from '@/constants/theme';

type Role = 'client' | 'lawyer' | 'law_firm';
type UploadKey = 'government_id' | 'ibp_id' | 'dti_sec_registration' | 'business_permit' | 'valid_id';
type UploadFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

const DOCUMENT_MIME_TYPES = [
  'image/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function getPasswordStrength(password: string) {
  if (!password) return { label: '', color: undefined };
  if (password.length < 6) return { label: 'Weak', color: '#B00020' };
  if (/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(password)) {
    return { label: 'Strong', color: '#388e3c' };
  }
  if (/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(password)) {
    return { label: 'Good', color: '#fbc02d' };
  }
  return { label: 'Weak', color: '#B00020' };
}

export default function RegisterScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [role, setRole] = useState<Role>('client');
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experience, setExperience] = useState('');
  const [location, setLocation] = useState('');

  const [firmName, setFirmName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [uploads, setUploads] = useState<Partial<Record<UploadKey, UploadFile>>>({});

  const roles: { value: Role; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: 'client', label: "I'm a Client", icon: 'person' },
    { value: 'lawyer', label: "I'm a Lawyer", icon: 'hammer' },
    { value: 'law_firm', label: 'Law Firm', icon: 'business' },
  ];

  const subtitle =
    role === 'lawyer'
      ? 'Create your lawyer account'
      : role === 'law_firm'
        ? 'Register your law firm'
        : 'Create your client account';

  const submitLabel =
    role === 'lawyer' ? 'Register as Lawyer' : role === 'law_firm' ? 'Register Firm' : 'Create Account';

  async function pickRegistrationDocument(key: UploadKey) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if ((asset.size ?? 0) > MAX_DOCUMENT_BYTES) {
        Alert.alert('File Too Large', 'Please choose a document or image that is 10 MB or smaller.');
        return;
      }

      setUploads((prev) => ({
        ...prev,
        [key]: {
          uri: asset.uri,
          name: asset.name || `${key}.pdf`,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size,
        },
      }));
    } catch (error: any) {
      Alert.alert('Upload Failed', error?.message || 'Could not open the file picker. Please try again.');
    }
  }

  function buildRegistrationForm(data: Record<string, unknown>) {
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    });

    Object.entries(uploads).forEach(([key, file]) => {
      if (file) {
        form.append(key, {
          uri: file.uri,
          name: file.name,
          type: file.type,
        } as any);
      }
    });

    return form;
  }

  async function handleRegister() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !passwordConfirm) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (!acceptedTerms) {
      Alert.alert('Error', 'Please accept the Terms and Conditions and Privacy Policy.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    const data: Record<string, unknown> = {
      email: normalizedEmail,
      password,
      password_confirmation: passwordConfirm,
      role,
    };

    if (role === 'client') {
      data.name = name;
    } else if (role === 'lawyer') {
      data.first_name = firstName;
      data.middle_name = middleName;
      data.last_name = lastName;
      data.specialty = specialty;
      data.hourly_rate = parseFloat(hourlyRate) || 0;
      data.experience_years = parseInt(experience, 10) || 0;
      data.location = location;
      data.firm_name = firmName;
    } else if (role === 'law_firm') {
      data.name = name;
      data.firm_name = firmName;
      data.city = city;
      data.phone = phone;
      data.website = website;
    }

    setLoading(true);
    try {
      const payload = role === 'client' ? data : buildRegistrationForm(data);
      const { data: res } = await authApi.register(payload);
      await setSession(res.token, res.user);
      router.replace('/');
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      if (errors) {
        const msg = Object.values(errors).flat().join('\n');
        Alert.alert('Registration Failed', msg);
      } else if (!err?.response) {
        Alert.alert('Registration Failed', 'Cannot reach server. Check Wi-Fi, API URL, and backend server status.');
      } else {
        Alert.alert('Error', err?.response?.data?.message || 'Registration failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  const renderPasswordField = (
    value: string,
    onChangeText: (value: string) => void,
    showValue: boolean,
    onToggle: () => void,
    placeholder: string,
    showStrength = false,
  ) => {
    const strength = getPasswordStrength(value);

    return (
      <View style={styles.passwordBlock}>
        <View
          style={[
            styles.passwordRow,
            showStrength && value.length > 0 && {
              borderColor:
                strength.label === 'Weak'
                  ? '#B00020'
                  : strength.label === 'Good'
                    ? '#fbc02d'
                    : strength.label === 'Strong'
                      ? '#388e3c'
                      : Colors.border,
            },
          ]}
        >
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder={placeholder}
            placeholderTextColor={Colors.textLight}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={!showValue}
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={onToggle} hitSlop={8}>
            <Ionicons name={showValue ? 'eye-off-outline' : 'eye-outline'} size={17} color={Colors.textLight} />
          </TouchableOpacity>
        </View>
        {showStrength && value.length > 0 && strength.label ? (
          <>
            <View style={styles.strengthTrack}>
              <View
                style={[
                  styles.strengthFill,
                  {
                    width: strength.label === 'Weak' ? '33%' : strength.label === 'Good' ? '66%' : '100%',
                    backgroundColor: strength.color,
                  },
                ]}
              />
            </View>
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -24}
    >
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.appName}>
              Lex<Text style={styles.appNameAccent}>Connect</Text>
            </Text>
            <Text style={styles.tagline}>{subtitle}</Text>
          </View>

          <View style={styles.roleRow}>
            {roles.map((r) => {
              const active = role === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.roleBtn, active && styles.roleBtnActive]}
                  onPress={() => setRole(r.value)}
                  activeOpacity={0.86}
                >
                  <Ionicons name={r.icon} size={13} color={active ? '#FFFFFF' : Colors.textMuted} />
                  <Text style={[styles.roleBtnText, active && styles.roleBtnTextActive]} numberOfLines={1}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <SectionTitle label="Personal Information" />

          {role !== 'lawyer' ? (
            <Field label="Full Name" value={name} onChangeText={setName} placeholder="e.g. Alex Johnson" />
          ) : null}

          <Field
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Password</Text>
              {renderPasswordField(password, setPassword, showPassword, () => setShowPassword((prev) => !prev), 'Min. 6 characters', true)}
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Confirm Password</Text>
              {renderPasswordField(passwordConfirm, setPasswordConfirm, showPasswordConfirm, () => setShowPasswordConfirm((prev) => !prev), 'Repeat password')}
            </View>
          </View>

          {role === 'lawyer' ? (
            <>
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Field label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="e.g. Juan" />
                </View>
                <View style={styles.fieldHalf}>
                  <Field label="Last Name *" value={lastName} onChangeText={setLastName} placeholder="e.g. dela Cruz" />
                </View>
              </View>
              <Field label="Middle Name (optional)" value={middleName} onChangeText={setMiddleName} placeholder="e.g. Santos" />

              <SectionTitle label="Professional Information" />
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Field label="Specialty / Practice Area" value={specialty} onChangeText={setSpecialty} placeholder="Select or type your specialty" />
                </View>
                <View style={styles.fieldHalf}>
                  <Field label="Law Firm / Organization" value={firmName} onChangeText={setFirmName} placeholder="Independent (no firm)" />
                </View>
              </View>
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Field label="Hourly Rate (PHP)" value={hourlyRate} onChangeText={setHourlyRate} placeholder="3000" keyboardType="numeric" />
                </View>
                <View style={styles.fieldHalf}>
                  <Field label="Years of Experience" value={experience} onChangeText={setExperience} placeholder="1" keyboardType="numeric" />
                </View>
              </View>
              <Field label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Makati, Metro Manila" />

              <SectionTitle label="Please Upload Documents For Verification" centered />
              <View style={styles.uploadRow}>
                <UploadBox label="Government ID" icon="card" file={uploads.government_id} onPress={() => pickRegistrationDocument('government_id')} />
                <UploadBox label="IBP ID" icon="document-text" file={uploads.ibp_id} onPress={() => pickRegistrationDocument('ibp_id')} />
              </View>
            </>
          ) : null}

          {role === 'law_firm' ? (
            <>
              <SectionTitle label="Firm Information" />
              <Field label="Firm / Organization Name *" value={firmName} onChangeText={setFirmName} placeholder="e.g. Morrison & Associates" />
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Field label="City" value={city} onChangeText={setCity} placeholder="e.g. New York" />
                </View>
                <View style={styles.fieldHalf}>
                  <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" />
                </View>
              </View>
              <Field label="Website" value={website} onChangeText={setWebsite} placeholder="https://yourfirm.com" autoCapitalize="none" />

              <SectionTitle label="Required Registration Documents" centered />
              <View style={styles.uploadGrid}>
                <UploadBox label="DTI/SEC Registration" icon="briefcase" file={uploads.dti_sec_registration} onPress={() => pickRegistrationDocument('dti_sec_registration')} />
                <UploadBox label="Business Permit" icon="document-text" file={uploads.business_permit} onPress={() => pickRegistrationDocument('business_permit')} />
                <UploadBox label="Valid ID" icon="card" file={uploads.valid_id} onPress={() => pickRegistrationDocument('valid_id')} />
                <UploadBox label="IBP ID" icon="document-text" file={uploads.ibp_id} onPress={() => pickRegistrationDocument('ibp_id')} />
              </View>
            </>
          ) : null}

          <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms((prev) => !prev)} activeOpacity={0.8}>
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
            </View>
            <Text style={styles.termsText}>
              I have read, understood, and accepted the <Text style={styles.inlineLink}>Terms and Conditions</Text> and{' '}
              <Text style={styles.inlineLink}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>

          <AppButton label={submitLabel} onPress={handleRegister} loading={loading} style={styles.submitButton} textStyle={styles.submitButtonText} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
};

function Field({ label, style, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, style]} placeholderTextColor={Colors.textLight} {...props} />
    </View>
  );
}

function SectionTitle({ label, centered = false }: { label: string; centered?: boolean }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, centered && styles.sectionTitleCentered]}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function UploadBox({
  label,
  icon,
  file,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  file?: UploadFile;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.uploadBox, file && styles.uploadBoxSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Upload ${label}`}
    >
      <Ionicons name={file ? 'checkmark-circle' : icon} size={13} color={file ? Colors.success : Colors.primary} />
      <View style={styles.uploadTextColumn}>
        <Text style={[styles.uploadText, file && styles.uploadTextSelected]} numberOfLines={1}>
          {label}
        </Text>
        {file ? <Text style={styles.uploadFileName} numberOfLines={1}>{file.name}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  panel: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
    marginBottom: 24,
  },
  appName: {
    color: Colors.primary,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  appNameAccent: {
    color: Colors.secondary,
  },
  tagline: {
    color: Colors.textLight,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  roleRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },
  roleBtn: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  roleBtnActive: {
    backgroundColor: Colors.primary,
    borderRightColor: Colors.primary,
  },
  roleBtnText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  roleBtnTextActive: {
    color: '#FFFFFF',
  },
  section: {
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.secondary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 9,
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  sectionLine: {
    height: 1,
    backgroundColor: '#E8DEBF',
  },
  field: {
    marginBottom: 11,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 7,
    letterSpacing: 0,
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
  },
  passwordBlock: {
    marginBottom: 11,
  },
  passwordRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    minHeight: 36,
    borderWidth: 0,
    paddingVertical: 8,
  },
  eyeBtn: {
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  strengthTrack: {
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: '#EEF2F7',
    overflow: 'hidden',
  },
  strengthFill: {
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '800',
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  uploadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  uploadBox: {
    flex: 1,
    minWidth: '46%',
    minHeight: 42,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  uploadBoxSelected: {
    borderStyle: 'solid',
    borderColor: Colors.success,
    backgroundColor: '#F0FDF4',
  },
  uploadTextColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  uploadText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  uploadTextSelected: {
    color: Colors.success,
  },
  uploadFileName: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 1,
    marginBottom: 14,
  },
  checkbox: {
    width: 15,
    height: 15,
    borderWidth: 1,
    borderColor: Colors.textLight,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  termsText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: 0,
  },
  inlineLink: {
    color: Colors.secondary,
    fontWeight: '900',
  },
  submitButton: {
    minHeight: 40,
    paddingVertical: 10,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    marginTop: 0,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 2,
  },
  footerText: {
    color: Colors.textLight,
    fontSize: 12,
    fontWeight: '600',
  },
  footerLink: {
    color: Colors.secondary,
    fontSize: 12,
    fontWeight: '900',
  },
});
