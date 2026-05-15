import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { authApi, lawFirmApi } from '@/services/api';
import AppButton from '@/components/AppButton';
import SecurityCenterCard from '@/components/SecurityCenterCard';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/auth';
import { resolveStorageUrl } from '@/services/endpoints';

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text.length > 0) return text;
  }
  return '';
}

function getErrorText(error: any) {
  const errors = error?.response?.data?.errors;
  if (errors) return Object.values(errors).flat().join('\n');
  return String(error?.response?.data?.message ?? error?.message ?? '');
}

function isDuplicateFirmNameError(error: any) {
  const message = getErrorText(error).toLowerCase();
  return (
    message.includes('firm')
    && message.includes('name')
    && (
      message.includes('already')
      || message.includes('taken')
      || message.includes('unique')
      || message.includes('duplicate')
      || message.includes('exists')
    )
  );
}

type FirmDocKey = 'dti_sec_registration' | 'business_permit' | 'valid_id' | 'firm_ibp_id';

const FIRM_DOCUMENTS: { key: FirmDocKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'dti_sec_registration', label: 'DTI/SEC Registration', icon: 'business-outline' },
  { key: 'business_permit', label: 'Business Permit', icon: 'document-text-outline' },
  { key: 'valid_id', label: 'Valid ID', icon: 'card-outline' },
  { key: 'firm_ibp_id', label: 'IBP ID', icon: 'id-card-outline' },
];

const DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export default function LawFirmSettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { updateUser } = useAuth();
  const backHandledRef = useRef(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [statsData, setStatsData] = useState({ cases: 0, earned: 0, memberSince: '' });

  const initials = useMemo(() => {
    const src = (profile?.firm_name || profile?.name || 'F').trim();
    return src.charAt(0).toUpperCase();
  }, [profile?.firm_name, profile?.name]);

  const [firmName, setFirmName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [firmSize, setFirmSize] = useState('');
  const [cutPercentage, setCutPercentage] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [documents, setDocuments] = useState<Partial<Record<FirmDocKey, DocumentPicker.DocumentPickerAsset>>>({});

  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmNextPassword, setConfirmNextPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmNextPassword, setShowConfirmNextPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileRes, dashboardRes, earningsRes] = await Promise.allSettled([
        lawFirmApi.profile(),
        lawFirmApi.dashboard(),
        lawFirmApi.earnings(),
      ]);

      const profileData = profileRes.status === 'fulfilled' ? (profileRes.value?.data ?? {}) : {};
      const dashboardData = dashboardRes.status === 'fulfilled' ? (dashboardRes.value?.data ?? {}) : {};
      const earningsData = earningsRes.status === 'fulfilled' ? (earningsRes.value?.data ?? {}) : {};

      const resolvedFirmName = pickText(
        profileData?.firm_name,
        profileData?.firm?.name,
        dashboardData?.firm_name,
        dashboardData?.firm?.name,
        profileData?.company_name,
        profileData?.organization_name,
        profileData?.name,
      );

      const merged = {
        ...profileData,
        ...(resolvedFirmName ? { firm_name: resolvedFirmName } : {}),
      };

      setProfile(merged);
      if (merged?.avatar_url) setAvatarUri(resolveStorageUrl(merged.avatar_url));
      setFirmName(pickText(merged?.firm_name, merged?.name));
      setTagline(String(merged?.tagline ?? ''));
      setDescription(String(merged?.description ?? ''));
      setPhone(String(merged?.phone ?? ''));
      setAddress(pickText(merged?.address, merged?.location));
      setCity(String(merged?.city ?? ''));
      setWebsite(String(merged?.website ?? ''));
      setFoundedYear(String(merged?.founded_year ?? ''));
      setFirmSize(String(merged?.firm_size ?? ''));
      setCutPercentage(String(merged?.cut_percentage ?? ''));
      setSpecialties(Array.isArray(merged?.specialties) ? merged.specialties.join(', ') : String(merged?.specialties ?? ''));

      const createdAt = merged?.created_at ?? '';
      setStatsData({
        cases: dashboardData?.total_consultations ?? dashboardData?.stats?.total ?? 0,
        earned: Number(earningsData?.total_earned ?? earningsData?.firm_cut_total ?? 0),
        memberSince: createdAt ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
      });
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      backHandledRef.current = false;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        backHandledRef.current = true;
        router.replace('/(lawfirm)/profile' as any);
        return true;
      });
      return () => subscription.remove();
    }, [router])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (backHandledRef.current) return;
      const actionType = String(event?.data?.action?.type ?? '');
      if (actionType === 'JUMP_TO') return;

      event.preventDefault();
      backHandledRef.current = true;
      router.replace('/(lawfirm)/profile' as any);
    });

    return unsubscribe;
  }, [navigation, router]);

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const form = new FormData();
      form.append('avatar', { uri: asset.uri, name: `avatar.${ext}`, type: `image/${ext === 'jpg' ? 'jpeg' : ext}` } as any);
      await lawFirmApi.updateAvatar(form as any);
      const profileRes = await lawFirmApi.profile();
      const refreshed = profileRes?.data ?? {};
      const nextAvatar = refreshed?.avatar_url ? resolveStorageUrl(refreshed.avatar_url) : asset.uri;
      setProfile((prev: any) => ({ ...prev, ...refreshed }));
      setAvatarUri(nextAvatar);
      updateUser({ avatar_url: nextAvatar });
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.response?.data?.message || 'Unable to upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile() {
    if (!firmName.trim()) {
      Alert.alert('Firm Name Required', 'Please enter a unique law firm name before saving.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        firm_name: firmName.trim() || null,
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        location: address.trim() || null,
        city: city.trim() || null,
        website: website.trim() || null,
        founded_year: foundedYear.trim() || null,
        firm_size: firmSize.trim() || null,
        cut_percentage: cutPercentage.trim() || null,
        specialties: specialties
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      };

      await lawFirmApi.updateProfile(payload);
      await load();
      Alert.alert('Saved', 'Firm profile updated successfully.');
    } catch (err: any) {
      if (isDuplicateFirmNameError(err)) {
        Alert.alert(
          'Law Firm Name Already Exists',
          'A law firm with this name is already registered. Please use a unique firm name.'
        );
        return;
      }
      Alert.alert('Save Failed', err?.response?.data?.message || 'Unable to update profile right now.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePickDocument(key: FirmDocKey) {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;
    setDocuments((prev) => ({ ...prev, [key]: result.assets[0] }));
  }

  async function handleSaveDocuments() {
    const entries = Object.entries(documents) as [FirmDocKey, DocumentPicker.DocumentPickerAsset][];
    if (entries.length === 0) {
      Alert.alert('No Documents Selected', 'Choose at least one registration document to upload.');
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      entries.forEach(([key, asset]) => {
        form.append(key, {
          uri: asset.uri,
          name: asset.name || `${key}.pdf`,
          type: asset.mimeType || 'application/octet-stream',
        } as any);
      });
      await lawFirmApi.updateProfile(form as any);
      setDocuments({});
      await load();
      Alert.alert('Uploaded', 'Registration documents uploaded successfully.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.response?.data?.message || 'Unable to upload documents right now.');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    const current = currentPassword.trim();
    const next = nextPassword.trim();
    const confirmNext = confirmNextPassword.trim();

    if (!current || !next || !confirmNext) {
      Alert.alert('Missing Fields', 'Please fill in current password, new password, and confirmation.');
      return;
    }

    if (next.length < 8) {
      Alert.alert('Weak Password', 'New password must be at least 8 characters long.');
      return;
    }

    if (next !== confirmNext) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.login((profile?.email || '').trim().toLowerCase(), current);
      await lawFirmApi.updateProfile({
        password: next,
        password_confirmation: confirmNext,
      });

      setCurrentPassword('');
      setNextPassword('');
      setConfirmNextPassword('');
      setShowCurrentPassword(false);
      setShowNextPassword(false);
      setShowConfirmNextPassword(false);
      Alert.alert('Password Updated', 'Your password was changed successfully.');
    } catch (err: any) {
      Alert.alert(
        'Change Failed',
        err?.response?.data?.message || err?.response?.data?.errors?.password?.[0] || 'Unable to change password right now.'
      );
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* ── My Profile Header ── */}
        <Text style={styles.pageTitle}>My Profile</Text>
        <Text style={styles.pageSubtitle}>Manage your personal information and account details</Text>

        {/* ── Profile Photo Card ── */}
        <View style={styles.card}>
          <View style={styles.photoSectionHeader}>
            <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.photoSectionTitle}>Profile Photo</Text>
          </View>
          <View style={styles.photoRow}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.photoAvatar} />
            ) : (
              <View style={styles.photoAvatarFallback}>
                <Text style={styles.photoAvatarInitial}>{initials}</Text>
              </View>
            )}
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.uploadPhotoBtn} onPress={handlePickPhoto} disabled={uploadingAvatar}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="camera" size={15} color="#fff" /><Text style={styles.uploadPhotoBtnText}>Upload Photo</Text></>}
              </TouchableOpacity>
              <Text style={styles.photoHint}>JPG, PNG or WebP · Max 4MB</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statsData.cases}</Text>
              <Text style={styles.statLabel}>Cases</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>₱{Number(statsData.earned).toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statsData.memberSince || '—'}</Text>
              <Text style={styles.statLabel}>Member Since</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Firm Information</Text>

          <Text style={styles.label}>Law Firm Name</Text>
          <TextInput
            style={styles.input}
            value={firmName}
            onChangeText={setFirmName}
            placeholder="Law firm name"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.disabledInput]}
            value={String(profile?.email ?? '')}
            editable={false}
            placeholder="Email"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Phone number"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={address}
            onChangeText={setAddress}
            multiline
            placeholder="Office address"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Website</Text>
          <TextInput
            style={styles.input}
            value={website}
            onChangeText={setWebsite}
            keyboardType="url"
            autoCapitalize="none"
            placeholder="https://yourfirm.com"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Tagline</Text>
          <TextInput
            style={styles.input}
            value={tagline}
            onChangeText={setTagline}
            placeholder="Short firm tagline"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Describe your firm"
            placeholderTextColor={Colors.textLight}
          />

          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <Text style={styles.label}>Founded Year</Text>
              <TextInput
                style={styles.input}
                value={foundedYear}
                onChangeText={setFoundedYear}
                keyboardType="number-pad"
                placeholder="e.g. 2015"
                placeholderTextColor={Colors.textLight}
              />
            </View>
            <View style={styles.twoColItem}>
              <Text style={styles.label}>Firm Size</Text>
              <TextInput
                style={styles.input}
                value={firmSize}
                onChangeText={setFirmSize}
                placeholder="e.g. 10-20"
                placeholderTextColor={Colors.textLight}
              />
            </View>
          </View>

          <Text style={styles.label}>Firm Cut Percentage</Text>
          <TextInput
            style={styles.input}
            value={cutPercentage}
            onChangeText={setCutPercentage}
            keyboardType="decimal-pad"
            placeholder="e.g. 15"
            placeholderTextColor={Colors.textLight}
          />

          <Text style={styles.label}>Specialties</Text>
          <TextInput
            style={styles.input}
            value={specialties}
            onChangeText={setSpecialties}
            placeholder="Family Law, Corporate Law, Labor Law"
            placeholderTextColor={Colors.textLight}
          />

          <AppButton label="Save Firm Info" onPress={handleSaveProfile} loading={saving} style={{ marginTop: 14 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Registration Documents</Text>
          <Text style={styles.hint}>Upload the same verification documents required on the web dashboard.</Text>
          <View style={styles.documentGrid}>
            {FIRM_DOCUMENTS.map((doc) => {
              const selected = documents[doc.key];
              return (
                <TouchableOpacity
                  key={doc.key}
                  style={[styles.documentBox, selected && styles.documentBoxSelected]}
                  onPress={() => handlePickDocument(doc.key)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={doc.icon} size={18} color={selected ? '#166534' : Colors.primaryDark} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.documentLabel}>{doc.label}</Text>
                    <Text style={styles.documentName} numberOfLines={1}>
                      {selected?.name ?? 'Tap to choose file'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <AppButton label="Upload Documents" onPress={handleSaveDocuments} loading={saving} style={{ marginTop: 14 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <Text style={styles.hint}>Change your password and keep your account protected.</Text>

          <Text style={styles.label}>Current Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={Colors.textLight}
              secureTextEntry={!showCurrentPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowCurrentPassword((prev) => !prev)}>
              <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>New Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={nextPassword}
              onChangeText={setNextPassword}
              placeholder="New password (min 8 chars)"
              placeholderTextColor={Colors.textLight}
              secureTextEntry={!showNextPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNextPassword((prev) => !prev)}>
              <Ionicons name={showNextPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm New Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={confirmNextPassword}
              onChangeText={setConfirmNextPassword}
              placeholder="Confirm new password"
              placeholderTextColor={Colors.textLight}
              secureTextEntry={!showConfirmNextPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmNextPassword((prev) => !prev)}>
              <Ionicons name={showConfirmNextPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <AppButton label="Change Password" onPress={handleChangePassword} loading={changingPassword} style={{ marginTop: 14 }} />
        </View>

        <SecurityCenterCard />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2F6' },
  content: { padding: 14, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEF2F6' },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 4, marginTop: 8 },
  pageSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  photoSectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  photoAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.border },
  photoAvatarFallback: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary + '22', borderWidth: 2, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  photoAvatarInitial: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  photoActions: { flex: 1, gap: 6 },
  uploadPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryDark, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' },
  uploadPhotoBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  photoHint: { fontSize: 11, color: Colors.textMuted },
  statsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border + '66', paddingTop: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border + '80' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E7EF', padding: 14, marginBottom: 10 },
  cardTitle: { color: Colors.text, fontSize: 19, fontWeight: '800', marginBottom: 6 },
  hint: { color: Colors.textMuted, fontSize: 12, marginBottom: 8 },
  label: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 76, textAlignVertical: 'top' },
  twoCol: { flexDirection: 'row', gap: 10 },
  twoColItem: { flex: 1 },
  documentGrid: { gap: 10, marginTop: 10 },
  documentBox: {
    minHeight: 58,
    borderWidth: 1.4,
    borderStyle: 'dashed',
    borderColor: '#9DB0C7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFD',
  },
  documentBoxSelected: { borderColor: '#16A34A', backgroundColor: '#ECFDF3' },
  documentLabel: { color: Colors.text, fontWeight: '800', fontSize: 13 },
  documentName: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  disabledInput: { opacity: 0.7, backgroundColor: '#F5F7FB' },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent' },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
