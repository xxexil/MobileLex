import { useCallback, useEffect, useMemo, useState, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons as IoniconsIcon } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, RoleColors } from '@/constants/theme';
import { formatPhp } from '@/constants/currency';
import { clientApi } from '@/services/api';
import { resolveStorageUrl } from '@/services/endpoints';
import { useFocusEffect } from '@react-navigation/native';
import AnimatedBorderCard from '@/components/AnimatedBorderCard';

const Ionicons = IoniconsIcon as any;

type Lawyer = {
  id: number;
  name: string;
  specialty?: string;
  location?: string;
  firm?: string;
  experience_years?: number;
  hourly_rate?: number;
  rating?: number;
  review_count?: number;
  availability_status?: string;
  is_certified?: boolean;
  avatar_url?: string | null;
  avatar?: string | null;
  profile_photo_url?: string | null;
  photo_url?: string | null;
  user?: {
    avatar_url?: string | null;
    avatar?: string | null;
    profile_photo_url?: string | null;
    photo_url?: string | null;
  } | null;
};

type SortMode = 'recommended' | 'rate_asc' | 'rating' | 'availability';

const SORT_OPTIONS: Array<{ key: SortMode; label: string; hint: string }> = [
  { key: 'recommended', label: 'Recommended', hint: 'Best overall fit' },
  { key: 'rate_asc', label: 'Lowest rate', hint: 'Budget-friendly first' },
  { key: 'rating', label: 'Top rated', hint: 'Highest reviews first' },
  { key: 'availability', label: 'Available now', hint: 'Open lawyers first' },
];

const SAVED_LAWYERS_KEY = 'client_saved_lawyers_v1';

function getLawyerAvatarUrl(lawyer: Lawyer) {
  const raw =
    lawyer.avatar_url
    || lawyer.avatar
    || lawyer.profile_photo_url
    || lawyer.photo_url
    || lawyer.user?.avatar_url
    || lawyer.user?.avatar
    || lawyer.user?.profile_photo_url
    || lawyer.user?.photo_url
    || '';
  const trimmed = String(raw).trim();
  return trimmed ? resolveStorageUrl(trimmed) : '';
}

export default function LawyersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    specialty?: string;
    location?: string;
    min_rate?: string;
    max_rate?: string;
    min_experience?: string;
    min_rating?: string;
    availability?: string;
  }>();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const favoriteUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState('');
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [newLawyerCount, setNewLawyerCount] = useState(0);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [savedLawyerIds, setSavedLawyerIds] = useState<number[]>([]);
  const [favoriteBanner, setFavoriteBanner] = useState<{ lawyerId: number; name: string; action: 'saved' | 'removed' } | null>(null);
  const [minRateInput, setMinRateInput] = useState('0');
  const [maxRateInput, setMaxRateInput] = useState('1000');
  const [locationFilter, setLocationFilter] = useState('All');
  const [minExperience, setMinExperience] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [availabilityFilter, setAvailabilityFilter] = useState('Any');

  const selectedSpecialty = useMemo(() => {
    const raw = typeof params.specialty === 'string' ? params.specialty.trim() : '';
    return !raw || raw.toLowerCase() === 'all' ? 'All' : raw;
  }, [params.specialty]);
  const selectedLocation = useMemo(() => {
    const raw = typeof params.location === 'string' ? params.location.trim().toLowerCase() : '';
    return !raw || raw === 'all' ? '' : raw;
  }, [params.location]);
  const selectedMaxRate = useMemo(() => {
    const raw = Number(params.max_rate);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [params.max_rate]);
  const selectedMinRate = useMemo(() => {
    const raw = Number(params.min_rate);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [params.min_rate]);
  const selectedMinExperience = useMemo(() => {
    const raw = Number(params.min_experience);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }, [params.min_experience]);
  const selectedMinRating = useMemo(() => {
    const raw = Number(params.min_rating);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }, [params.min_rating]);
  const selectedAvailability = useMemo(() => {
    const raw = typeof params.availability === 'string' ? params.availability.trim() : '';
    return raw || 'Any';
  }, [params.availability]);

  const specialties = useMemo(() => {
    const values = lawyers
      .map((l) => l.specialty?.trim())
      .filter((v): v is string => !!v);
    const unique = Array.from(new Set(values));
    return ['All', ...unique];
  }, [lawyers]);

  const locations = useMemo(() => {
    const values = lawyers
      .map((l) => l.location?.trim())
      .filter((v): v is string => !!v);
    return ['All', ...Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))];
  }, [lawyers]);

  const appliedMinRate = useMemo(() => {
    const parsed = Number(minRateInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [minRateInput]);

  const appliedMaxRate = useMemo(() => {
    const parsed = Number(maxRateInput);
    return Number.isFinite(parsed) && parsed > 0 && parsed !== 1000 ? parsed : null;
  }, [maxRateInput]);

  const filteredLawyers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const normalizedLocation = locationFilter.toLowerCase() === 'all' ? '' : locationFilter.toLowerCase();
    const normalizedAvailability = availabilityFilter.toLowerCase();
    return lawyers
      .filter((l) => {
        const byCategory = activeFilter === 'All' || l.specialty === activeFilter;
        const rate = Number(l.hourly_rate ?? 0);
        const rating = Number(l.rating ?? 0);
        const experience = Number(l.experience_years ?? 0);
        const byLocation = !normalizedLocation || l.location?.toLowerCase().includes(normalizedLocation);
        const byMinRate = appliedMinRate == null || (rate > 0 && rate >= appliedMinRate);
        const byMaxRate = appliedMaxRate == null || (rate > 0 && rate <= appliedMaxRate);
        const byExperience = minExperience <= 0 || experience >= minExperience;
        const byRating = minRating <= 0 || rating >= minRating;
        const byAvailability = normalizedAvailability === 'any'
          || String(l.availability_status ?? '').toLowerCase() === normalizedAvailability;
        const bySearch = !normalized
          || l.name?.toLowerCase().includes(normalized)
          || l.specialty?.toLowerCase().includes(normalized)
          || l.location?.toLowerCase().includes(normalized);
        return byCategory && bySearch && byLocation && byMinRate && byMaxRate && byExperience && byRating && byAvailability;
      })
      .sort((left, right) => {
        const leftRate = Number(left.hourly_rate ?? 0);
        const rightRate = Number(right.hourly_rate ?? 0);
        const leftRating = Number(left.rating ?? 0);
        const rightRating = Number(right.rating ?? 0);
        const leftExperience = Number(left.experience_years ?? 0);
        const rightExperience = Number(right.experience_years ?? 0);
        const leftAvailable = String(left.availability_status ?? '').toLowerCase() === 'available' ? 1 : 0;
        const rightAvailable = String(right.availability_status ?? '').toLowerCase() === 'available' ? 1 : 0;

        if (sortMode === 'availability') {
          if (leftAvailable !== rightAvailable) return rightAvailable - leftAvailable;
          if (leftRating !== rightRating) return rightRating - leftRating;
          if (leftExperience !== rightExperience) return rightExperience - leftExperience;
          return leftRate - rightRate;
        }

        if (sortMode === 'rating') {
          if (leftRating !== rightRating) return rightRating - leftRating;
          if (leftAvailable !== rightAvailable) return rightAvailable - leftAvailable;
          return leftRate - rightRate;
        }

        if (sortMode === 'rate_asc') {
          if (leftRate !== rightRate) return leftRate - rightRate;
          if (leftRating !== rightRating) return rightRating - leftRating;
          return left.name.localeCompare(right.name);
        }

        const leftScore =
          leftAvailable * 100 +
          leftRating * 15 +
          leftExperience * 1.5 +
          Math.max(0, 1000 - leftRate) * 0.02;
        const rightScore =
          rightAvailable * 100 +
          rightRating * 15 +
          rightExperience * 1.5 +
          Math.max(0, 1000 - rightRate) * 0.02;

        if (leftScore !== rightScore) return rightScore - leftScore;

        if (sortMode === 'recommended') {
          const leftSaved = savedLawyerIds.includes(left.id) ? 1 : 0;
          const rightSaved = savedLawyerIds.includes(right.id) ? 1 : 0;
          if (leftSaved !== rightSaved) return rightSaved - leftSaved;
        }

        if (appliedMaxRate != null) {
          const leftDistance = Math.max(0, appliedMaxRate - leftRate);
          const rightDistance = Math.max(0, appliedMaxRate - rightRate);
          if (leftDistance !== rightDistance) return leftDistance - rightDistance;
          if (leftRate !== rightRate) return rightRate - leftRate;
        } else if (leftRate !== rightRate) {
          return leftRate - rightRate;
        }

        return left.name.localeCompare(right.name);
      });
  }, [activeFilter, appliedMaxRate, appliedMinRate, availabilityFilter, lawyers, locationFilter, minExperience, minRating, query, savedLawyerIds, sortMode]);

  const savedLawyersPreview = useMemo(
    () => filteredLawyers.filter((lawyer) => savedLawyerIds.includes(lawyer.id)).slice(0, 3),
    [filteredLawyers, savedLawyerIds]
  );

  const hasSearchFilters = query.trim().length > 0
    || activeFilter !== 'All'
    || locationFilter !== 'All'
    || appliedMinRate != null
    || appliedMaxRate != null
    || minExperience > 0
    || minRating > 0
    || availabilityFilter !== 'Any';
  const hasRouteFilters = selectedSpecialty !== 'All'
    || !!selectedLocation
    || selectedMinRate != null
    || selectedMaxRate != null
    || selectedMinExperience > 0
    || selectedMinRating > 0
    || selectedAvailability !== 'Any';
  const activeFilterLabel = useMemo(() => {
    const labels: string[] = [];
    if (activeFilter !== 'All') labels.push(activeFilter);
    if (locationFilter !== 'All') labels.push(locationFilter);
    if (appliedMinRate != null) labels.push(`from ${formatPhp(appliedMinRate)}/hr`);
    if (appliedMaxRate != null && appliedMaxRate !== 1000) labels.push(`up to ${formatPhp(appliedMaxRate)}/hr`);
    if (minExperience > 0) labels.push(`${minExperience}+ yrs`);
    if (minRating > 0) labels.push(`${minRating}+ stars`);
    if (availabilityFilter !== 'Any') labels.push(availabilityFilter);
    if (query.trim()) labels.push(`"${query.trim()}"`);
    return labels.join(' | ');
  }, [activeFilter, appliedMaxRate, appliedMinRate, availabilityFilter, locationFilter, minExperience, minRating, query]);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilter !== 'All') count += 1;
    if (locationFilter !== 'All') count += 1;
    if (appliedMinRate != null) count += 1;
    if (appliedMaxRate != null) count += 1;
    if (minExperience > 0) count += 1;
    if (minRating > 0) count += 1;
    if (availabilityFilter !== 'Any') count += 1;
    return count;
  }, [activeFilter, appliedMaxRate, appliedMinRate, availabilityFilter, locationFilter, minExperience, minRating]);
  const routeFilterLabel = useMemo(() => {
    const labels: string[] = [];
    if (selectedSpecialty !== 'All') labels.push(selectedSpecialty);
    if (selectedLocation) labels.push(selectedLocation);
    if (selectedMinRate != null) labels.push(`from ${formatPhp(selectedMinRate)}/hr`);
    if (selectedMaxRate != null) labels.push(`up to ${formatPhp(selectedMaxRate)}/hr`);
    if (selectedMinExperience > 0) labels.push(`${selectedMinExperience}+ yrs`);
    if (selectedMinRating > 0) labels.push(`${selectedMinRating}+ stars`);
    if (selectedAvailability !== 'Any') labels.push(selectedAvailability);
    return labels.join(' | ');
  }, [selectedAvailability, selectedLocation, selectedMaxRate, selectedMinExperience, selectedMinRate, selectedMinRating, selectedSpecialty]);
  const availableCount = useMemo(
    () => filteredLawyers.filter((lawyer) => String(lawyer.availability_status ?? '').toLowerCase() === 'available').length,
    [filteredLawyers]
  );
  const averageRate = useMemo(() => {
    const rates = filteredLawyers
      .map((lawyer) => Number(lawyer.hourly_rate ?? 0))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    if (!rates.length) return 0;
    return Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
  }, [filteredLawyers]);

  useEffect(() => {
    if (!selectedSpecialty || selectedSpecialty === 'All') {
      setActiveFilter('All');
      return;
    }
    setActiveFilter(selectedSpecialty);
  }, [selectedSpecialty]);

  useEffect(() => {
    if (selectedLocation) {
      const matched = locations.find((location) => location.toLowerCase() === selectedLocation);
      setLocationFilter(matched || selectedLocation);
    }
  }, [locations, selectedLocation]);

  useEffect(() => {
    if (selectedMaxRate != null) {
      setMaxRateInput(String(selectedMaxRate));
    }
  }, [selectedMaxRate]);

  useEffect(() => {
    if (selectedMinRate != null) {
      setMinRateInput(String(selectedMinRate));
    }
  }, [selectedMinRate]);

  useEffect(() => {
    setMinExperience(selectedMinExperience);
  }, [selectedMinExperience]);

  useEffect(() => {
    setMinRating(selectedMinRating);
  }, [selectedMinRating]);

  useEffect(() => {
    setAvailabilityFilter(selectedAvailability);
  }, [selectedAvailability]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(SAVED_LAWYERS_KEY)
      .then((value) => {
        if (!mounted || !value) return;
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            const ids = parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
            setSavedLawyerIds(Array.from(new Set(ids)));
          }
        } catch {
          // Ignore malformed local cache.
        }
      })
      .catch(() => {
        // Ignore storage errors and keep the screen usable.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const { data } = await clientApi.lawyers();
      const payload = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

      setLawyers((previous) => {
        // Track newly discovered lawyers using previous snapshot from state updater.
        const existingIds = new Set(previous.map((l) => l.id));
        const newLawyers = payload.filter((lawyer: Lawyer) => !existingIds.has(lawyer.id));
        if (newLawyers.length > 0) {
          setNewLawyerCount((count) => count + newLawyers.length);
        }
        return payload;
      });
    } catch {
      setLoadError('Unable to load lawyers right now. Pull to refresh to try again.');
      setLawyers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-poll for new lawyers every 30 seconds when screen is focused
  useFocusEffect(
    useCallback(() => {
      // Initial load
      load();

      // Set up polling interval
      pollIntervalRef.current = setInterval(() => {
        load();
      }, 30000) as any; // Poll every 30 seconds

      // Cleanup
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }, [load])
  );

  useEffect(() => {
    return () => {
      if (favoriteUndoTimeoutRef.current) {
        clearTimeout(favoriteUndoTimeoutRef.current);
        favoriteUndoTimeoutRef.current = null;
      }
    };
  }, []);

  const goToLawyer = useCallback((id: number, openBook = false) => {
    if (openBook) {
      router.push(`/lawyer/${id}?openBook=1` as any);
      return;
    }

    router.push(`/lawyer/${id}` as any);
  }, [router]);

  function clearFilters() {
    setQuery('');
    setActiveFilter('All');
    setMinRateInput('0');
    setMaxRateInput('1000');
    setLocationFilter('All');
    setMinExperience(0);
    setMinRating(0);
    setAvailabilityFilter('Any');
    setSortMode('recommended');
    setFilterSheetVisible(false);
    router.replace('/(client)/lawyers' as any);
  }

  const handleMessage = useCallback(async (lawyerId: number) => {
    try {
      await clientApi.startConversation(lawyerId);
      router.push('/(client)/messages');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Unable to start conversation.');
    }
  }, [router]);

  function persistSavedLawyers(next: number[]) {
    void AsyncStorage.setItem(SAVED_LAWYERS_KEY, JSON.stringify(next));
  }

  function showFavoriteBanner(lawyerId: number, action: 'saved' | 'removed') {
    const lawyer = lawyers.find((entry) => entry.id === lawyerId);
    if (!lawyer) return;

    if (favoriteUndoTimeoutRef.current) {
      clearTimeout(favoriteUndoTimeoutRef.current);
    }

    setFavoriteBanner({ lawyerId, name: lawyer.name, action });
    favoriteUndoTimeoutRef.current = setTimeout(() => {
      setFavoriteBanner(null);
    }, 3000);
  }

  function setSavedLawyerState(lawyerId: number, shouldSave: boolean) {
    setSavedLawyerIds((current) => {
      const alreadySaved = current.includes(lawyerId);
      const next = shouldSave
        ? (alreadySaved ? current : [...current, lawyerId])
        : current.filter((id) => id !== lawyerId);
      persistSavedLawyers(next);
      return next;
    });
  }

  const toggleSavedLawyer = useCallback((lawyerId: number) => {
    setSavedLawyerIds((current) => {
      const isSaved = current.includes(lawyerId);
      const next = isSaved
        ? current.filter((id) => id !== lawyerId)
        : [...current, lawyerId];
      persistSavedLawyers(next);
      showFavoriteBanner(lawyerId, isSaved ? 'removed' : 'saved');
      return next;
    });
  }, [showFavoriteBanner]);

  const undoFavoriteChange = useCallback(() => {
    if (!favoriteBanner) return;
    setSavedLawyerState(favoriteBanner.lawyerId, favoriteBanner.action === 'removed');
    setFavoriteBanner(null);
    if (favoriteUndoTimeoutRef.current) {
      clearTimeout(favoriteUndoTimeoutRef.current);
      favoriteUndoTimeoutRef.current = null;
    }
  }, [favoriteBanner]);

  function getMatchReasons(params: {
    lawyer: Lawyer;
    query: string;
    activeFilter: string;
    locationFilter: string;
    minRate: number | null;
    maxRate: number | null;
    minExperience: number;
    minRating: number;
    availabilityFilter: string;
  }) {
    const {
      lawyer,
      query,
      activeFilter,
      locationFilter,
      minRate,
      maxRate,
      minExperience,
      minRating,
      availabilityFilter,
    } = params;

    const reasons: string[] = [];
    const rate = Number(lawyer.hourly_rate ?? 0);
    const rating = Number(lawyer.rating ?? 0);
    const experience = Number(lawyer.experience_years ?? 0);

    if (availabilityFilter.toLowerCase() === 'available' && String(lawyer.availability_status ?? '').toLowerCase() === 'available') {
      reasons.push('Available now');
    }
    if (activeFilter !== 'All' && lawyer.specialty === activeFilter) {
      reasons.push(`${activeFilter} fit`);
    }
    if (locationFilter !== 'All' && lawyer.location?.toLowerCase().includes(locationFilter.toLowerCase())) {
      reasons.push(`Near ${locationFilter}`);
    }
    if (minRate != null && rate >= minRate) {
      reasons.push('Meets min rate');
    }
    if (maxRate != null && rate <= maxRate) {
      reasons.push('Within budget');
    }
    if (minExperience > 0 && experience >= minExperience) {
      reasons.push(`${experience}+ yrs experience`);
    }
    if (minRating > 0 && rating >= minRating) {
      reasons.push(`${rating.toFixed(1)}+ rating`);
    }
    if (query.trim()) {
      const normalized = query.trim().toLowerCase();
      const hitsQuery =
        lawyer.name?.toLowerCase().includes(normalized)
        || lawyer.specialty?.toLowerCase().includes(normalized)
        || lawyer.location?.toLowerCase().includes(normalized);
      if (hitsQuery) reasons.push('Matches search');
    }

    if (!reasons.length) {
      if (lawyer.is_certified) reasons.push('Certified profile');
      if (String(lawyer.availability_status ?? '').toLowerCase() === 'available') reasons.push('Consult ready');
      if (rating > 0) reasons.push(`${rating.toFixed(1)} rating`);
    }

    return reasons.slice(0, 3);
  }

  const matchReasonsById = useMemo(() => {
    const reasons = new Map<number, string[]>();

    filteredLawyers.forEach((lawyer) => {
      reasons.set(lawyer.id, getMatchReasons({
        lawyer,
        query,
        activeFilter,
        locationFilter,
        minRate: appliedMinRate,
        maxRate: appliedMaxRate,
        minExperience,
        minRating,
        availabilityFilter,
      }));
    });

    return reasons;
  }, [
    activeFilter,
    appliedMaxRate,
    appliedMinRate,
    availabilityFilter,
    filteredLawyers,
    locationFilter,
    minExperience,
    minRating,
    query,
  ]);

  const topPickLawyerId = filteredLawyers[0]?.id ?? null;

  const renderLawyerItem = useCallback(({ item }: { item: Lawyer }) => (
    <LawyerCard
      id={item.id}
      name={item.name}
      specialty={item.specialty}
      location={item.location}
      firm={item.firm}
      experienceYears={Number(item.experience_years ?? 0)}
      hourlyRate={Number(item.hourly_rate ?? 0)}
      rating={item.rating}
      reviewCount={item.review_count}
      availabilityStatus={item.availability_status}
      avatarUrl={getLawyerAvatarUrl(item)}
      isCertified={item.is_certified}
      isTopPick={sortMode === 'recommended' && topPickLawyerId === item.id}
      isSaved={savedLawyerIds.includes(item.id)}
      matchReasons={matchReasonsById.get(item.id) ?? []}
      onGoToLawyer={goToLawyer}
      onMessage={handleMessage}
      onToggleSaved={toggleSavedLawyer}
    />
  ), [
    goToLawyer,
    handleMessage,
    matchReasonsById,
    savedLawyerIds,
    sortMode,
    topPickLawyerId,
    toggleSavedLawyer,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AnimatedBorderCard
        style={styles.heroCardShell}
        contentStyle={styles.heroCard}
        borderRadius={18}
        borderWidth={1.2}
        borderBaseColor="rgba(130, 174, 232, 0.62)"
        contentBackgroundColor={Colors.primaryDark}
      >
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroEyebrow}>CLIENT SPACE</Text>
            <Text style={styles.heroTitle}>Find a Lawyer</Text>
          </View>
          {newLawyerCount > 0 && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{newLawyerCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.heroSub}>Find the right lawyer quickly, then message or book in a few taps.</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search lawyer, specialty, or city"
            placeholderTextColor={Colors.textLight}
            style={styles.searchInput}
          />
          {query.trim().length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.heroActionsRow}>
          <TouchableOpacity style={styles.heroActionBtn} onPress={() => setFilterSheetVisible(true)}>
            <Ionicons name="options-outline" size={15} color="#fff" />
            <Text style={styles.heroActionText}>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroActionGhost}
            onPress={() => {
              const currentIndex = SORT_OPTIONS.findIndex((option) => option.key === sortMode);
              const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % SORT_OPTIONS.length : 0;
              setSortMode(SORT_OPTIONS[nextIndex].key);
            }}
          >
            <Ionicons name="swap-vertical-outline" size={15} color={RoleColors.client.shell} />
            <Text style={styles.heroActionGhostText}>
              Sort: {SORT_OPTIONS.find((option) => option.key === sortMode)?.label ?? 'Recommended'}
            </Text>
          </TouchableOpacity>
        </View>
      </AnimatedBorderCard>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={Colors.error} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      ) : null}

      {favoriteBanner ? (
        <View style={styles.favoriteBanner}>
          <View style={styles.favoriteBannerLeft}>
            <View style={[styles.favoriteBannerIcon, favoriteBanner.action === 'saved' ? styles.favoriteBannerIconSaved : styles.favoriteBannerIconRemoved]}>
              <Ionicons
                name={favoriteBanner.action === 'saved' ? 'heart' : 'heart-dislike'}
                size={15}
                color="#fff"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.favoriteBannerTitle}>
                {favoriteBanner.action === 'saved' ? 'Added to favorites' : 'Removed from favorites'}
              </Text>
              <Text style={styles.favoriteBannerText} numberOfLines={1}>
                {favoriteBanner.name}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={undoFavoriteChange} style={styles.favoriteBannerUndoBtn} activeOpacity={0.85}>
            <Text style={styles.favoriteBannerUndoText}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={filteredLawyers}
        keyExtractor={(item) => item.id.toString()}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={[
          filteredLawyers.length || hasRouteFilters ? styles.list : styles.emptyWrap,
          { paddingBottom: insets.bottom + 72 },
        ]}
        ListHeaderComponent={
          filteredLawyers.length || hasRouteFilters ? (
            <>
              {hasRouteFilters ? (
                <View style={styles.appliedSearchCard}>
                  <View style={styles.appliedSearchHeader}>
                    <View style={styles.appliedSearchTitleRow}>
                      <Ionicons name="options-outline" size={15} color={RoleColors.client.shell} />
                      <Text style={styles.appliedSearchTitle}>Applied search</Text>
                    </View>
                    <TouchableOpacity style={styles.appliedSearchClear} onPress={clearFilters}>
                      <Text style={styles.appliedSearchClearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.appliedSearchPill}>
                    <Ionicons name="sparkles-outline" size={13} color="#7A5B0B" />
                    <Text style={styles.appliedSearchText} numberOfLines={2}>
                      {routeFilterLabel || activeFilterLabel || 'Quick Lawyer Search'}
                    </Text>
                  </View>
                </View>
              ) : null}
              {filteredLawyers.length ? (
            <View style={styles.resultsHeaderCard}>
              <View>
                <Text style={styles.resultsCount}>
                  <Text style={styles.resultsCountStrong}>{filteredLawyers.length}</Text> lawyer{filteredLawyers.length === 1 ? '' : 's'} found
                </Text>
                <Text style={styles.resultsMeta}>
                  {availableCount} active now
                  {averageRate > 0 ? ` | avg ${formatPhp(averageRate)}/hr` : ''}
                </Text>
              </View>
              <View style={styles.resultsStatusPill}>
                <Ionicons name="checkmark-circle-outline" size={14} color={RoleColors.client.accent} />
                <Text style={styles.resultsStatusText}>
                  {SORT_OPTIONS.find((option) => option.key === sortMode)?.label ?? 'Recommended'}
                </Text>
              </View>
            </View>
              ) : null}
              {savedLawyerIds.length > 0 ? (
                <View style={styles.compareCard}>
                  <View style={styles.compareHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.compareEyebrow}>COMPARE SHORTLIST</Text>
                      <Text style={styles.compareTitle}>Saved lawyers</Text>
                      <Text style={styles.compareDesc}>
                        {savedLawyersPreview.length > 0
                          ? 'Scan your strongest options side by side before you book.'
                          : 'Saved lawyers will appear here once they are in the current results.'}
                      </Text>
                    </View>
                    <View style={styles.comparePill}>
                      <Ionicons name="layers-outline" size={14} color={RoleColors.client.accent} />
                      <Text style={styles.comparePillText}>{savedLawyerIds.length}</Text>
                    </View>
                  </View>

                  {savedLawyersPreview.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compareScroll}>
                      {savedLawyersPreview.map((lawyer) => {
                        const isAvailable = String(lawyer.availability_status ?? '').toLowerCase() === 'available';
                        return (
                          <TouchableOpacity
                            key={`compare-${lawyer.id}`}
                            style={styles.compareTile}
                            activeOpacity={0.88}
                            onPress={() => goToLawyer(lawyer.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open profile for ${lawyer.name}`}
                          >
                            <View style={styles.compareTileTop}>
                              <Text style={styles.compareTileName} numberOfLines={1}>
                                {lawyer.name}
                              </Text>
                              <View style={[styles.compareStatus, isAvailable ? styles.compareStatusActive : styles.compareStatusBusy]}>
                                <Text style={[styles.compareStatusText, isAvailable ? styles.compareStatusTextActive : styles.compareStatusTextBusy]}>
                                  {isAvailable ? 'Active' : 'Busy'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.compareTileMeta} numberOfLines={1}>
                              {lawyer.specialty || 'General Practice'}
                            </Text>
                            <Text style={styles.compareTileRate} numberOfLines={1}>
                              {formatPhp(Number(lawyer.hourly_rate || 0))}/hr
                            </Text>
                            <Text style={styles.compareTileHint} numberOfLines={2}>
                              {Number(lawyer.experience_years ?? 0)} yrs exp · {Number(lawyer.review_count ?? 0)} reviews
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : null}

                  <View style={styles.compareActions}>
                    <TouchableOpacity style={styles.comparePrimaryBtn} onPress={() => router.push('/(client)/lawyers' as any)}>
                      <Text style={styles.comparePrimaryText}>Review shortlist</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.compareGhostBtn} onPress={() => router.push('/(client)/lawyers?availability=available' as any)}>
                      <Text style={styles.compareGhostText}>Find active lawyers</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={40} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No matching lawyers</Text>
            <Text style={styles.emptySub}>Try another specialty, location, rate, or search keyword.</Text>
            {hasSearchFilters && (
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={clearFilters}
              >
                <Text style={styles.resetBtnText}>Clear Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={renderLawyerItem}
      />

      <Modal
        visible={filterSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFilterSheetVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Filters</Text>
                <Text style={styles.sheetSubtitle}>Tune the match before you browse.</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterSheetVisible(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={18} color={RoleColors.client.shell} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Sort by</Text>
                <View style={styles.stackChips}>
                  {SORT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.sortChip, sortMode === option.key && styles.sortChipActive]}
                      onPress={() => setSortMode(option.key)}
                    >
                      <Text style={[styles.sortChipTitle, sortMode === option.key && styles.sortChipTitleActive]}>{option.label}</Text>
                      <Text style={[styles.sortChipHint, sortMode === option.key && styles.sortChipHintActive]}>{option.hint}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Practice area</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineChipWrap}>
                  {specialties.map((specialty) => (
                    <TouchableOpacity
                      key={specialty}
                      style={[styles.inlineChip, activeFilter === specialty && styles.inlineChipActive]}
                      onPress={() => setActiveFilter(specialty)}
                    >
                      <Text style={[styles.inlineChipText, activeFilter === specialty && styles.inlineChipTextActive]}>{specialty}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Location</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineChipWrap}>
                  {locations.map((location) => (
                    <TouchableOpacity
                      key={location}
                      style={[styles.inlineChip, locationFilter === location && styles.inlineChipActive]}
                      onPress={() => setLocationFilter(location)}
                    >
                      <Text style={[styles.inlineChipText, locationFilter === location && styles.inlineChipTextActive]}>{location}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Budget</Text>
                <View style={styles.rangeRow}>
                  <View style={styles.rangeField}>
                    <Text style={styles.rangeLabel}>Min rate</Text>
                    <TextInput
                      value={minRateInput}
                      onChangeText={setMinRateInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={Colors.textLight}
                      style={styles.rangeInput}
                    />
                  </View>
                  <View style={styles.rangeField}>
                    <Text style={styles.rangeLabel}>Max rate</Text>
                    <TextInput
                      value={maxRateInput}
                      onChangeText={setMaxRateInput}
                      keyboardType="numeric"
                      placeholder="1000"
                      placeholderTextColor={Colors.textLight}
                      style={styles.rangeInput}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Experience</Text>
                <View style={styles.quickChoiceRow}>
                  {[0, 3, 5, 10, 15].map((years) => (
                    <TouchableOpacity
                      key={String(years)}
                      style={[styles.quickChoice, minExperience === years && styles.quickChoiceActive]}
                      onPress={() => setMinExperience(years)}
                    >
                      <Text style={[styles.quickChoiceText, minExperience === years && styles.quickChoiceTextActive]}>
                        {years === 0 ? 'Any' : `${years}+ yrs`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Minimum rating</Text>
                <View style={styles.quickChoiceRow}>
                  {[0, 3, 3.5, 4, 4.5].map((rating) => (
                    <TouchableOpacity
                      key={String(rating)}
                      style={[styles.quickChoice, minRating === rating && styles.quickChoiceActive]}
                      onPress={() => setMinRating(rating)}
                    >
                      <Text style={[styles.quickChoiceText, minRating === rating && styles.quickChoiceTextActive]}>
                        {rating === 0 ? 'Any' : `${rating} stars`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.sheetSection}>
                <Text style={styles.sheetSectionTitle}>Availability</Text>
                <View style={styles.quickChoiceRow}>
                  {['Any', 'available', 'busy'].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[styles.quickChoice, availabilityFilter.toLowerCase() === status.toLowerCase() && styles.quickChoiceActive]}
                      onPress={() => setAvailabilityFilter(status)}
                    >
                      <Text style={[styles.quickChoiceText, availabilityFilter.toLowerCase() === status.toLowerCase() && styles.quickChoiceTextActive]}>
                        {status === 'Any' ? 'Any' : status === 'available' ? 'Active now' : 'Busy'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.sheetSecondaryBtn} onPress={clearFilters}>
                <Text style={styles.sheetSecondaryBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetPrimaryBtn} onPress={() => setFilterSheetVisible(false)}>
                <Text style={styles.sheetPrimaryBtnText}>Show results</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StarRatingRow({ rating, reviewCount }: { rating?: number; reviewCount?: number }) {
  const safeRating = Number.isFinite(Number(rating)) ? Number(rating) : 0;
  const clampedRating = Math.max(0, Math.min(5, safeRating));
  const hasRating = clampedRating > 0;
  const fullStars = Math.floor(clampedRating);
  const decimal = clampedRating - fullStars;

  const stars = Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;

    if (position <= fullStars) return 'star';
    if (position === fullStars + 1 && decimal >= 0.25) {
      return decimal >= 0.75 ? 'star' : 'star-half';
    }
    return 'star-outline';
  });

  return (
    <View style={styles.starRatingWrap}>
      <View style={styles.starIconsRow}>
        {stars.map((starName, index) => (
          <Ionicons
            key={`rating-star-${index}`}
            name={starName as any}
            size={18}
            color={starName === 'star-outline' ? '#D1D5DB' : '#F4B400'}
          />
        ))}
      </View>
      <Text style={[styles.starRatingText, !hasRating && styles.starRatingTextMuted]}>
        {hasRating ? clampedRating.toFixed(1) : 'No ratings yet'}
        {hasRating && Number(reviewCount || 0) > 0 ? ` (${Number(reviewCount || 0)} reviews)` : ''}
      </Text>
    </View>
  );
}

type LawyerCardProps = {
  id: number;
  name: string;
  specialty?: string;
  location?: string;
  firm?: string;
  experienceYears: number;
  hourlyRate: number;
  rating?: number;
  reviewCount?: number;
  availabilityStatus?: string;
  avatarUrl?: string;
  isCertified?: boolean;
  isTopPick: boolean;
  isSaved: boolean;
  matchReasons: string[];
  onGoToLawyer: (id: number, openBook?: boolean) => void;
  onMessage: (lawyerId: number) => void;
  onToggleSaved: (lawyerId: number) => void;
};

const LawyerCard = memo(function LawyerCard({
  id,
  name,
  specialty,
  location,
  firm,
  experienceYears,
  hourlyRate,
  rating,
  reviewCount,
  availabilityStatus,
  avatarUrl,
  isCertified,
  isTopPick,
  isSaved,
  matchReasons,
  onGoToLawyer,
  onMessage,
  onToggleSaved,
}: LawyerCardProps) {
  const isAvailable = String(availabilityStatus ?? '').toLowerCase() === 'available';
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const showAvatarImage = Boolean(avatarUrl) && !avatarLoadFailed;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={() => onGoToLawyer(id)}
          accessibilityRole="button"
          accessibilityLabel={`View full profile of ${name}`}
        >
          {showAvatarImage ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              resizeMode="cover"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <Text style={styles.avatarText}>{name?.charAt(0)?.toUpperCase() || 'L'}</Text>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.cardEyebrowRow}>
            {isTopPick ? (
              <View style={styles.recommendedPill}>
                <Ionicons name="sparkles" size={11} color="#7A5B0B" />
                <Text style={styles.recommendedText}>Best match</Text>
              </View>
            ) : null}
            {isCertified ? (
              <View style={styles.certifiedPill}>
                <Ionicons name="shield-checkmark" size={11} color={RoleColors.client.accent} />
                <Text style={styles.certifiedText}>Certified</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => onGoToLawyer(id)}
            accessibilityRole="button"
            accessibilityLabel={`View full profile of ${name}`}
          >
            <Text style={styles.name}>{name}</Text>
          </TouchableOpacity>
          <View style={styles.specialtyPill}>
            <Ionicons name="briefcase-outline" size={11} color={RoleColors.client.shell} />
            <Text style={styles.specialtyPillText}>{specialty || 'General Practice'}</Text>
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.sub}>{location || 'Location not set'}</Text>
          </View>
          {firm ? (
            <View style={styles.firmRow}>
              <Ionicons name="business-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.firmText} numberOfLines={1}>
                {firm}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardTopActions}>
          <View style={[styles.availability, isAvailable ? styles.available : styles.busy]}>
            <Text style={[styles.availabilityText, isAvailable ? styles.availableText : styles.busyText]}>
              {isAvailable ? 'Available' : 'Busy'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onToggleSaved(id)}
            style={[styles.saveBtn, isSaved && styles.saveBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? `Remove ${name} from saved lawyers` : `Save ${name}`}
          >
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={14}
              color={isSaved ? '#fff' : RoleColors.client.shell}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="Rate" value={`${formatPhp(Number(hourlyRate || 0))}/hr`} />
        <Metric label="Experience" value={`${experienceYears || 0} yrs`} />
      </View>

      {matchReasons.length > 0 ? (
        <View style={styles.matchBlock}>
          <Text style={styles.matchBlockTitle}>Why this match</Text>
          <View style={styles.matchChips}>
            {matchReasons.map((reason) => (
              <View key={reason} style={styles.matchChip}>
                <Ionicons name="sparkles-outline" size={11} color={RoleColors.client.accent} />
                <Text style={styles.matchChipText}>{reason}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <StarRatingRow rating={rating} reviewCount={reviewCount} />

      <View style={styles.trustRow}>
        <View style={styles.trustChip}>
          <Ionicons name="shield-checkmark-outline" size={13} color={RoleColors.client.accent} />
          <Text style={styles.trustText}>Verified profile</Text>
        </View>
        <View style={styles.trustChip}>
          <Ionicons name="videocam-outline" size={13} color={RoleColors.client.accent} />
          <Text style={styles.trustText}>Consult ready</Text>
        </View>
        {Number(reviewCount ?? 0) > 0 ? (
          <View style={styles.trustChip}>
            <Ionicons name="star-outline" size={13} color={RoleColors.client.accent} />
            <Text style={styles.trustText}>{Number(reviewCount)} reviews</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => onMessage(id)}>
          <Text style={styles.secondaryBtnText}>Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => onGoToLawyer(id, true)}>
          <Text style={styles.primaryBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}, (prev, next) => {
  const prevSaved = prev.isSaved;
  const nextSaved = next.isSaved;
  const prevReasons = prev.matchReasons.join('|');
  const nextReasons = next.matchReasons.join('|');

  return prev.id === next.id
    && prev.name === next.name
    && prev.specialty === next.specialty
    && prev.location === next.location
    && prev.firm === next.firm
    && prev.experienceYears === next.experienceYears
    && prev.hourlyRate === next.hourlyRate
    && prev.rating === next.rating
    && prev.reviewCount === next.reviewCount
    && prev.availabilityStatus === next.availabilityStatus
    && prev.isCertified === next.isCertified
    && prev.isTopPick === next.isTopPick
    && prevSaved === nextSaved
    && prevReasons === nextReasons
    && prev.onGoToLawyer === next.onGoToLawyer
    && prev.onMessage === next.onMessage
    && prev.onToggleSaved === next.onToggleSaved;
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  heroCardShell: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  heroCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: RoleColors.client.shell,
  },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  newBadge: {
    backgroundColor: Colors.success,
    borderRadius: 999,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  heroEyebrow: { color: '#D7E1F4', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  heroTitle: { color: '#fff', fontWeight: '800', fontSize: 22, marginTop: 3 },
  heroSub: { color: '#D7E1F4', fontSize: 13, marginTop: 4, lineHeight: 18 },
  searchWrap: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  heroActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  heroActionBtn: {
    flex: 1,
    backgroundColor: RoleColors.client.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroActionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  heroActionGhost: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#D9E2F2',
  },
  heroActionGhostText: { color: RoleColors.client.shell, fontWeight: '800', fontSize: 12, flexShrink: 1 },
  filtersContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  filterPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFD',
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF2',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPanelTitle: {
    color: RoleColors.client.shell,
    fontSize: 13,
    fontWeight: '900',
  },
  filterResultsBadge: {
    borderRadius: 999,
    backgroundColor: '#E8EDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterResultsText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  filtersContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtersScroller: { flexGrow: 0, flex: 1 },
  filtersRow: { paddingHorizontal: 10, gap: 8, alignItems: 'center' },
  filterChip: {
    backgroundColor: '#F7F9FC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 12,
    maxWidth: 160,
  },
  filterChipActive: { backgroundColor: RoleColors.client.shell, borderColor: RoleColors.client.shell },
  filterText: { color: Colors.textMuted, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: '#fff' },
  clearFiltersBtn: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  clearFiltersText: { color: RoleColors.client.shell, fontSize: 12, fontWeight: '800' },
  activeSelectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  activeSelectionPill: {
    flex: 1,
    flexShrink: 1,
    borderRadius: 8,
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeSelectionText: {
    color: '#7A5B0B',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  activeSelectionEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  activeSelectionEmptyText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  filterSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  filterSectionTitle: {
    color: RoleColors.client.shell,
    fontSize: 12,
    fontWeight: '900',
  },
  practiceScroll: {
    maxHeight: 140,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  radioOuter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: RoleColors.client.shell,
  },
  radioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: RoleColors.client.shell,
  },
  optionLabel: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: RoleColors.client.shell,
    fontWeight: '900',
  },
  rateInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rateInputGroup: {
    flex: 1,
  },
  inputMiniLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 5,
  },
  rateInput: {
    minHeight: 38,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  pillOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  applyFiltersBtn: {
    marginHorizontal: 14,
    marginTop: 14,
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: RoleColors.client.shell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFiltersText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  clearAllLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  clearAllText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  list: { paddingHorizontal: 16, paddingBottom: 18 },
  appliedSearchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  appliedSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 9,
  },
  appliedSearchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedSearchTitle: {
    color: RoleColors.client.shell,
    fontSize: 13,
    fontWeight: '900',
  },
  appliedSearchClear: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  appliedSearchClearText: {
    color: RoleColors.client.shell,
    fontSize: 12,
    fontWeight: '900',
  },
  appliedSearchPill: {
    borderRadius: 8,
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedSearchText: {
    flex: 1,
    color: '#7A5B0B',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  resultsHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultsCount: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  resultsCountStrong: {
    color: RoleColors.client.shell,
    fontSize: 16,
    fontWeight: '900',
  },
  resultsMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
  resultsStatusPill: {
    borderRadius: 8,
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  resultsStatusText: {
    color: '#7A5B0B',
    fontSize: 11,
    fontWeight: '800',
  },
  compareCard: {
    backgroundColor: '#F9FBFF',
    borderWidth: 1,
    borderColor: '#E5ECF6',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  compareEyebrow: {
    color: '#8A6A12',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  compareTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  compareDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  comparePill: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF4FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  comparePillText: { color: RoleColors.client.shell, fontSize: 13, fontWeight: '900' },
  compareScroll: { gap: 10, paddingTop: 2, paddingBottom: 2 },
  compareTile: {
    width: 136,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E7ECF5',
    borderRadius: 14,
    padding: 12,
  },
  compareTileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  compareTileName: { color: Colors.text, fontSize: 13, fontWeight: '800', flex: 1 },
  compareStatus: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  compareStatusActive: { backgroundColor: '#DCFCE7' },
  compareStatusBusy: { backgroundColor: '#FEF3C7' },
  compareStatusText: { fontSize: 10, fontWeight: '800' },
  compareStatusTextActive: { color: '#16A34A' },
  compareStatusTextBusy: { color: '#D97706' },
  compareTileMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 6 },
  compareTileRate: { color: RoleColors.client.shell, fontSize: 15, fontWeight: '900', marginTop: 5 },
  compareTileHint: { color: Colors.textMuted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  compareActions: { flexDirection: 'row', gap: 8 },
  comparePrimaryBtn: {
    flex: 1,
    backgroundColor: RoleColors.client.shell,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparePrimaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  compareGhostBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE5F4',
  },
  compareGhostText: { color: RoleColors.client.shell, fontSize: 13, fontWeight: '800' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptySub: { color: Colors.textMuted, textAlign: 'center', marginTop: 6 },
  resetBtn: {
    marginTop: 12,
    backgroundColor: RoleColors.client.shell,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  resetBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8EDF5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#1E2D4D',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  recommendedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recommendedText: { color: '#7A5B0B', fontSize: 11, fontWeight: '900' },
  certifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  certifiedText: { color: RoleColors.client.shell, fontSize: 11, fontWeight: '900' },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: RoleColors.client.shell,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { color: Colors.text, fontWeight: '800', fontSize: 16 },
  specialtyPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F4FF',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 5,
    marginBottom: 4,
  },
  specialtyPillText: {
    color: RoleColors.client.shell,
    fontSize: 11,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  firmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  firmText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  cardTopActions: {
    alignItems: 'center',
    gap: 8,
  },
  sub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  availability: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  available: { backgroundColor: `${Colors.success}1A` },
  busy: { backgroundColor: `${Colors.warning}1A` },
  availabilityText: { fontWeight: '700', fontSize: 11 },
  availableText: { color: Colors.success },
  busyText: { color: Colors.warning },
  saveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  saveBtnActive: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  metricsRow: { flexDirection: 'row', gap: 8 },
  matchBlock: {
    marginTop: 10,
    backgroundColor: '#F8FAFD',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  matchBlockTitle: {
    color: RoleColors.client.shell,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  matchChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  matchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  matchChipText: {
    color: '#7A5B0B',
    fontSize: 11,
    fontWeight: '800',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  metricLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700' },
  metricValue: { color: Colors.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  starRatingWrap: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  starIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starRatingText: {
    marginTop: 4,
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  starRatingTextMuted: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  trustRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF8E7',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  trustText: {
    color: '#7A5B0B',
    fontSize: 11,
    fontWeight: '800',
  },
  actionsRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: RoleColors.client.shell,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryBtnText: { color: RoleColors.client.shell, fontWeight: '800', fontSize: 13 },
  primaryBtn: {
    flex: 1,
    backgroundColor: RoleColors.client.shell,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F2C7C7',
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: { color: Colors.error, fontSize: 12, fontWeight: '700', flex: 1 },
  favoriteBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5D5A0',
    backgroundColor: '#FFFCF0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  favoriteBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  favoriteBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteBannerIconSaved: { backgroundColor: '#E11D48' },
  favoriteBannerIconRemoved: { backgroundColor: '#6B7280' },
  favoriteBannerTitle: { color: Colors.text, fontSize: 12, fontWeight: '800' },
  favoriteBannerText: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  favoriteBannerUndoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: RoleColors.client.shell,
  },
  favoriteBannerUndoText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 14,
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF1F8',
  },
  sheetTitle: { color: Colors.text, fontSize: 18, fontWeight: '900' },
  sheetSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  sheetSection: {
    marginBottom: 18,
  },
  sheetSectionTitle: {
    color: RoleColors.client.shell,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  stackChips: {
    gap: 8,
  },
  sortChip: {
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: RoleColors.client.shell,
  },
  sortChipTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  sortChipTitleActive: { color: RoleColors.client.shell },
  sortChipHint: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  sortChipHintActive: { color: RoleColors.client.shell },
  inlineChipWrap: {
    gap: 8,
    paddingBottom: 2,
  },
  inlineChip: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  inlineChipActive: {
    backgroundColor: RoleColors.client.shell,
    borderColor: RoleColors.client.shell,
  },
  inlineChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  inlineChipTextActive: {
    color: '#fff',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rangeField: {
    flex: 1,
  },
  rangeLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  rangeInput: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: '#fff',
  },
  quickChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChoice: {
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fff',
  },
  quickChoiceActive: {
    borderColor: RoleColors.client.shell,
    backgroundColor: '#EEF2FF',
  },
  quickChoiceText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  quickChoiceTextActive: {
    color: RoleColors.client.shell,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#ECF1F8',
  },
  sheetSecondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D9E2F2',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  sheetSecondaryBtnText: {
    color: RoleColors.client.shell,
    fontSize: 13,
    fontWeight: '900',
  },
  sheetPrimaryBtn: {
    flex: 1.2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: RoleColors.client.shell,
  },
  sheetPrimaryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
});
