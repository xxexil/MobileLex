import * as DocumentPicker from 'expo-document-picker';
import { Linking } from 'react-native';
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
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Image,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { authApi, lawyerApi } from '@/services/api';
import AppButton from '@/components/AppButton';
import SecurityCenterCard from '@/components/SecurityCenterCard';
import { Colors } from '@/constants/theme';
import { useRouter, useFocusEffect } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/context/auth';
import { resolveStorageUrl } from '@/services/endpoints';

interface ProfileDraft {
  name: string;
  phone: string;
  specialty: string;
  location: string;
  hourly_rate: string;
  experience_years: string;
  bio: string;
}

function profileToDraft(p: any): ProfileDraft {
  return {
    name: p?.name ?? '',
    phone: p?.phone ?? '',
    specialty: p?.specialty ?? '',
    location: p?.location ?? '',
    hourly_rate: p?.hourly_rate ? String(p.hourly_rate) : '',
    experience_years: p?.experience_years ? String(p.experience_years) : '',
    bio: p?.bio ?? '',
  };
}

function diffDraft(original: ProfileDraft, draft: ProfileDraft): { field: string; from: string; to: string }[] {
  const labels: Record<keyof ProfileDraft, string> = {
    name: 'Name',
    phone: 'Phone',
    specialty: 'Specialty',
    location: 'Location',
    hourly_rate: 'Hourly Rate',
    experience_years: 'Experience',
    bio: 'Bio',
  };
  return (Object.keys(labels) as (keyof ProfileDraft)[])
    .filter((k) => (draft[k] ?? '').trim() !== (original[k] ?? '').trim())
    .map((k) => ({ field: labels[k], from: original[k] || '—', to: draft[k] || '—' }));
}

export default function LawyerSettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { updateUser } = useAuth();
  const backHandledRef = useRef(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [statsData, setStatsData] = useState({ cases: 0, earned: 0, memberSince: '' });

  const initials = useMemo(() => {
    const src = (profile?.name || 'L').trim();
    return src.charAt(0).toUpperCase();
  }, [profile?.name]);

  // — Profile edit state —
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({ name: '', phone: '', specialty: '', location: '', hourly_rate: '', experience_years: '', bio: '' });
  const originalDraft = useRef<ProfileDraft>(draft);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // — Password change state —
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // — Document upload state —
  const [govIdFile, setGovIdFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [ibpIdFile, setIbpIdFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profileRes, dashboardRes, earningsRes] = await Promise.allSettled([
        lawyerApi.profile(),
        lawyerApi.dashboard(),
        lawyerApi.earnings(),
      ]);
      const data = profileRes.status === 'fulfilled' ? (profileRes.value?.data ?? {}) : {};
      const dash = dashboardRes.status === 'fulfilled' ? (dashboardRes.value?.data ?? {}) : {};
      const earn = earningsRes.status === 'fulfilled' ? (earningsRes.value?.data ?? {}) : {};
      setProfile(data);
      if (data?.avatar_url) setAvatarUri(resolveStorageUrl(data.avatar_url));
      const createdAt = data?.created_at ?? '';
      setStatsData({
        cases: dash?.stats?.total ?? dash?.total_consultations ?? 0,
        earned: Number(earn?.total_earned ?? earn?.this_month ?? 0),
        memberSince: createdAt ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
      });
      const d = profileToDraft(data);
      setDraft(d);
      originalDraft.current = d;
    } catch {
      // silent; UI can render with placeholders
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace('/(lawyer)/profile' as any);
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [router])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (backHandledRef.current) return;
      const actionType = event.data.action.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') return;

      event.preventDefault();
      backHandledRef.current = true;
      router.replace('/(lawyer)/profile' as any);
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
      await lawyerApi.updateProfile(form as any);
      const profileRes = await lawyerApi.profile();
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
    async function pickDocument(docType: 'government' | 'ibp') {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/jpeg', 'image/png', 'application/pdf'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        const fileObj = { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' };
        if (docType === 'government') setGovIdFile(fileObj);
        else setIbpIdFile(fileObj);
      } catch {
        Alert.alert('Error', 'Could not pick a file. Please try again.');
      }
    }

    async function handleUploadDocs() {
      if (!govIdFile && !ibpIdFile) return;
      setUploadingDocs(true);
      try {
        const form = new FormData();
        if (govIdFile) form.append('government_id', govIdFile as any);
        if (ibpIdFile) form.append('ibp_id', ibpIdFile as any);
        const { data } = await lawyerApi.updateProfile(form as any);
        setProfile((prev: any) => ({
          ...prev,
          government_id_doc: data?.government_id_doc ?? prev?.government_id_doc,
          ibp_id_doc: data?.ibp_id_doc ?? prev?.ibp_id_doc,
        }));
        setGovIdFile(null);
        setIbpIdFile(null);
        Alert.alert('Documents Uploaded', 'Your ID documents have been saved successfully.');
      } catch (e: any) {
        Alert.alert('Upload Failed', e?.response?.data?.message || 'Unable to upload documents.');
      } finally {
        setUploadingDocs(false);
      }
    }

  function startEdit() {
    originalDraft.current = { ...draft };
    setEditMode(true);
  }

  function cancelEdit() {
    setDraft({ ...originalDraft.current });
    setEditMode(false);
  }

  function requestSave() {
    const trimmed: ProfileDraft = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      specialty: draft.specialty.trim(),
      location: draft.location.trim(),
      hourly_rate: draft.hourly_rate.trim(),
      experience_years: draft.experience_years.trim(),
    };
    if (!trimmed.name) {
      Alert.alert('Required', 'Name cannot be empty.');
      return;
    }
    const changes = diffDraft(originalDraft.current, trimmed);
    if (changes.length === 0) {
      setEditMode(false);
      return;
    }
    setConfirmPassword('');
    setShowConfirmPassword(false);
    setConfirmVisible(true);
  }

  async function confirmSave() {
    const pwd = confirmPassword.trim();
    if (!pwd) {
      Alert.alert('Password Required', 'Please enter your current password to confirm the changes.');
      return;
    }

    setSavingProfile(true);
    try {
      // Verify identity first
      await authApi.login((profile?.email ?? '').trim().toLowerCase(), pwd);

      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        specialty: draft.specialty.trim() || null,
        location: draft.location.trim() || null,
      };
      if (draft.hourly_rate.trim()) payload.hourly_rate = parseFloat(draft.hourly_rate.trim());
      if (draft.experience_years.trim()) payload.experience_years = parseInt(draft.experience_years.trim(), 10);
      if (draft.bio.trim() !== undefined) payload.bio = draft.bio.trim() || null;

      const { data } = await lawyerApi.updateProfile(payload);
      setProfile(data?.lawyer ?? data);
      const updated = profileToDraft(data?.lawyer ?? data);
      setDraft(updated);
      originalDraft.current = updated;

      setConfirmVisible(false);
      setEditMode(false);
      Alert.alert('Profile Updated', 'Your profile information has been saved successfully.');
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.errors?.name?.[0] ||
        'Unable to save changes. Please check your password and try again.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    const current = currentPassword.trim();
    const next = newPassword.trim();
    const confirmNext = confirmNewPassword.trim();

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
      await authApi.login((profile?.email ?? '').trim().toLowerCase(), current);
      await lawyerApi.updateProfile({ password: next, password_confirmation: confirmNext });
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
      setShowCurrentPassword(false); setShowNewPassword(false); setShowConfirmNewPassword(false);
      Alert.alert('Password Updated', 'Your password was changed successfully.');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.errors?.password?.[0] || 'Unable to change password right now.';
      Alert.alert('Change Failed', msg);
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
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[Colors.primary]} />}
      >
        <Text style={styles.pageTitle}>My Profile</Text>
        <Text style={styles.pageSubtitle}>Manage your professional information and settings</Text>

        {/* ── Profile Sidebar Card ── */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickPhoto} disabled={uploadingAvatar}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>{profile?.name ?? '—'}</Text>
          <Text style={styles.profileSpecialty}>{profile?.specialty ?? 'Lawyer'}</Text>
          {profile?.law_firm_name ? <Text style={styles.profileFirm}>{profile.law_firm_name}</Text> : null}
          <View style={styles.profileStats}>
            <View style={styles.profileStat}>
              <Text style={styles.profileStatVal}>{profile?.experience_years ?? 0}</Text>
              <Text style={styles.profileStatLabel}>Yrs Exp.</Text>
            </View>
            <View style={styles.profileStatDiv} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatVal}>{profile?.reviews_count ?? 0}</Text>
              <Text style={styles.profileStatLabel}>Reviews</Text>
            </View>
            <View style={styles.profileStatDiv} />
            <View style={styles.profileStat}>
              <Text style={styles.profileStatVal}>{Number(profile?.rating ?? 0).toFixed(1)}</Text>
              <Text style={styles.profileStatLabel}>Rating</Text>
            </View>
          </View>
          {profile?.bar_certified && (
            <View style={styles.barBadge}>
              <Ionicons name="shield-checkmark" size={13} color={Colors.success} />
              <Text style={styles.barBadgeText}>Bar Certified</Text>
            </View>
          )}
        </View>

        {/* ── Edit Profile Form ── */}
        <View style={styles.formCard}>
          <View style={styles.formCardHeader}>
            <Ionicons name="pencil" size={15} color={Colors.text} />
            <Text style={styles.formCardTitle}>Edit Profile</Text>
          </View>

          {/* PERSONAL INFORMATION */}
          <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>
          <View style={styles.sectionDivider} />

          <View style={styles.fieldRow}>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={draft.name}
                onChangeText={(v) => setDraft((p) => ({ ...p, name: v }))}
                placeholder="Full name"
                placeholderTextColor={Colors.textLight}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={profile?.email ?? ''}
                editable={false}
                placeholder="Email"
                placeholderTextColor={Colors.textLight}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={draft.phone}
                onChangeText={(v) => setDraft((p) => ({ ...p, phone: v }))}
                placeholder="e.g. +63 9XX XXX XXXX"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* PROFESSIONAL INFORMATION */}
          <Text style={[styles.sectionLabel, { marginTop: 18 }]}>PROFESSIONAL INFORMATION</Text>
          <View style={styles.sectionDivider} />

          <View style={styles.twoCol}>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Specialty / Practice Area</Text>
              <TextInput
                style={styles.input}
                value={draft.specialty}
                onChangeText={(v) => setDraft((p) => ({ ...p, specialty: v }))}
                placeholder="e.g. Corporate Law"
                placeholderTextColor={Colors.textLight}
              />
            </View>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Law Firm / Organization</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={profile?.law_firm_name ?? ''}
                editable={false}
                placeholder="Law firm"
                placeholderTextColor={Colors.textLight}
              />
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Hourly Rate (₱)</Text>
              <TextInput
                style={styles.input}
                value={draft.hourly_rate}
                onChangeText={(v) => setDraft((p) => ({ ...p, hourly_rate: v }))}
                placeholder="e.g. 10000"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Years of Experience</Text>
              <TextInput
                style={styles.input}
                value={draft.experience_years}
                onChangeText={(v) => setDraft((p) => ({ ...p, experience_years: v }))}
                placeholder="e.g. 15"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.input}
              value={draft.location}
              onChangeText={(v) => setDraft((p) => ({ ...p, location: v }))}
              placeholder="e.g. Makati, Metro Manila"
              placeholderTextColor={Colors.textLight}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Professional Bio <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={draft.bio}
              onChangeText={(v) => setDraft((p) => ({ ...p, bio: v }))}
              placeholder="Share your background, expertise, and what clients can expect..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

            {/* SUBMITTED IDs */}
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>SUBMITTED IDs</Text>
            <View style={styles.sectionDivider} />

            <View style={styles.twoCol}>
              <View style={[styles.fieldWrap, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Government ID</Text>
                <TouchableOpacity
                  onPress={() => profile?.government_id_doc && Linking.openURL(profile.government_id_doc)}
                  disabled={!profile?.government_id_doc}
                >
                  <View style={styles.viewDocRow}>
                    <Ionicons name="document-text-outline" size={13} color={profile?.government_id_doc ? Colors.primary : Colors.textLight} />
                    <Text style={[styles.viewDocLink, !profile?.government_id_doc && { color: Colors.textLight }]}>
                      View current Government ID
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.uploadDocBtn} onPress={() => pickDocument('government')}>
                  <Ionicons name="attach-outline" size={15} color={Colors.primary} />
                  <Text style={styles.uploadDocText} numberOfLines={1}>{govIdFile ? govIdFile.name : 'Choose File'}</Text>
                </TouchableOpacity>
                <Text style={styles.docHint}>Upload a JPG, PNG, or PDF to replace the current file.</Text>
              </View>
              <View style={[styles.fieldWrap, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>IBP ID</Text>
                <TouchableOpacity
                  onPress={() => profile?.ibp_id_doc && Linking.openURL(profile.ibp_id_doc)}
                  disabled={!profile?.ibp_id_doc}
                >
                  <View style={styles.viewDocRow}>
                    <Ionicons name="document-text-outline" size={13} color={profile?.ibp_id_doc ? Colors.primary : Colors.textLight} />
                    <Text style={[styles.viewDocLink, !profile?.ibp_id_doc && { color: Colors.textLight }]}>
                      View current IBP ID
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.uploadDocBtn} onPress={() => pickDocument('ibp')}>
                  <Ionicons name="attach-outline" size={15} color={Colors.primary} />
                  <Text style={styles.uploadDocText} numberOfLines={1}>{ibpIdFile ? ibpIdFile.name : 'Choose File'}</Text>
                </TouchableOpacity>
                <Text style={styles.docHint}>Upload a JPG, PNG, or PDF to replace the current file.</Text>
              </View>
            </View>

            {(govIdFile || ibpIdFile) && (
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: Colors.primary, marginTop: 8 }, uploadingDocs && { opacity: 0.7 }]}
                onPress={handleUploadDocs}
                disabled={uploadingDocs}
              >
                {uploadingDocs
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                      <Text style={styles.saveBtnText}>Upload Documents</Text>
                    </>}
              </TouchableOpacity>
            )}

          {/* CHANGE PASSWORD */}
          <Text style={[styles.sectionLabel, { marginTop: 18 }]}>CHANGE PASSWORD <Text style={styles.optional}>(LEAVE BLANK TO KEEP CURRENT)</Text></Text>
          <View style={styles.sectionDivider} />

          <View style={styles.twoCol}>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowNewPassword((p) => !p)}>
                  <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.fieldWrap, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  placeholder="Repeat new password"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry={!showConfirmNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmNewPassword((p) => !p)}>
                  <Ionicons name={showConfirmNewPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Save Changes */}
          <TouchableOpacity
            style={[styles.saveBtn, savingProfile && { opacity: 0.7 }]}
            onPress={requestSave}
            disabled={savingProfile}
          >
            {savingProfile
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </>}
          </TouchableOpacity>
        </View>

        <SecurityCenterCard />
      </ScrollView>

      {/* ── Confirm Changes Modal ── */}
      <Modal visible={confirmVisible} transparent animationType="slide" onRequestClose={() => setConfirmVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="shield-checkmark-outline" size={26} color={Colors.primary} />
              <Text style={styles.modalTitle}>Confirm Changes</Text>
            </View>
            <Text style={styles.modalSubtitle}>Enter your current password to save changes:</Text>

            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Your current password"
                placeholderTextColor={Colors.textLight}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirmPassword((p) => !p)}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmVisible(false)} disabled={savingProfile}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <AppButton label="Confirm & Save" onPress={confirmSave} loading={savingProfile} style={{ flex: 1, marginTop: 0 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 14, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  pageTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 4, marginTop: 8 },
  pageSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },

  // Profile sidebar card
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.border },
  avatarFallback: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.primary + '22',
    borderWidth: 2, borderColor: Colors.primary + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 34, fontWeight: '800', color: Colors.primary },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.card,
  },
  profileName: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  profileSpecialty: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginBottom: 2 },
  profileFirm: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  profileStats: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Colors.border + '66',
    paddingTop: 14, marginTop: 6, width: '100%',
  },
  profileStat: { flex: 1, alignItems: 'center' },
  profileStatVal: { fontSize: 17, fontWeight: '800', color: Colors.text },
  profileStatLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  profileStatDiv: { width: 1, height: 32, backgroundColor: Colors.border + '80' },
  barBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 12, backgroundColor: Colors.success + '18',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.success + '40',
  },
  barBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.success },

  // Edit form card
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14,
  },
  formCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  formCardTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#C8A84B', letterSpacing: 0.8, marginBottom: 6 },
  sectionDivider: { height: 1, backgroundColor: Colors.border, marginBottom: 12 },
  fieldRow: { marginBottom: 10 },
  twoCol: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  fieldWrap: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 5 },
  optional: { fontSize: 11, fontWeight: '400', color: Colors.textLight },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.text, backgroundColor: Colors.background,
  },
  inputDisabled: { opacity: 0.5, backgroundColor: Colors.border + '30' },
  bioInput: { minHeight: 90, paddingTop: 10 },
    viewDocLink: { fontSize: 12, color: Colors.primary, textDecorationLine: 'underline', marginBottom: 6 },
    viewDocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    uploadDocBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4,
      backgroundColor: Colors.background,
    },
    uploadDocText: { fontSize: 12, color: Colors.text, flex: 1 },
    docHint: { fontSize: 10, color: Colors.textLight, lineHeight: 14 },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: 9,
    backgroundColor: Colors.background,
  },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: Colors.text },
  eyeBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 18, paddingVertical: 14, borderRadius: 10,
    backgroundColor: Colors.primaryDark,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Cancel btn (used in modal)
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSubtitle: { fontSize: 13, color: Colors.textMuted, marginBottom: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
});
