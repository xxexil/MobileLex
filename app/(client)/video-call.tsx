import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '@/context/auth';
import { clientApi, lawyerApi } from '@/services/api';
import { createReverbEcho, isReverbConfigured } from '@/services/realtime';

type WebRtcModule = any;
type MediaStreamLike = any;
type PeerConnectionLike = any;

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type ConsultationVideoMetadata = {
  consultation: {
    id: number;
    code?: string;
    status?: string;
    scheduled_at?: string;
    duration_minutes?: number;
  };
  room_name: string;
  join_url: string;
  display_name: string;
  can_join: boolean;
  join_opens_at?: string | null;
  signaling_channel: string;
  echo_signaling_channel?: string;
  broadcast_auth_endpoint?: string;
  peer_id: number | null;
  is_offer_initiator?: boolean;
  ice_servers: IceServer[];
};

type SignalPayload = {
  type: 'peer-ready' | 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'audio-muted' | 'consultation-ended';
  signalId: string;
  consultationId: number;
  fromUserId: number;
  fromRole: string;
  targetUserId: number;
  sentAt: number;
  sdp?: unknown;
  candidate?: unknown;
  balance_checkout_url?: string | null;
};

let cachedWebRtc: WebRtcModule | null = null;

function serializeSessionDescription(description: any) {
  if (!description) return null;
  const type = description.type || description._type;
  const sdp = description.sdp || description._sdp;
  if (!type || typeof sdp !== 'string' || !sdp.trim()) return null;
  return {
    type,
    sdp: sdp.replace(/\r?\n/g, '\r\n').trim() + '\r\n',
  };
}

function normalizeSessionDescription(description: any, expectedType: 'offer' | 'answer') {
  const normalized = serializeSessionDescription(description);
  if (!normalized || normalized.type !== expectedType) {
    return null;
  }
  return normalized;
}

function serializeIceCandidate(candidate: any) {
  if (!candidate) return null;
  if (typeof candidate.toJSON === 'function') return candidate.toJSON();
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

function loadWebRtcModule() {
  if (!NativeModules.WebRTCModule) return null;
  if (!cachedWebRtc) {
    cachedWebRtc = require('react-native-webrtc');
  }
  return cachedWebRtc;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'when the consultation opens';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCallDateTime(value?: string | null) {
  if (!value) return 'Schedule loading';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function createSignal(
  metadata: ConsultationVideoMetadata,
  user: { id: number; role?: string },
  type: SignalPayload['type'],
  extras: Partial<Pick<SignalPayload, 'sdp' | 'candidate'>> = {},
): SignalPayload | null {
  if (!metadata.peer_id) return null;
  return {
    type,
    signalId: `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    consultationId: metadata.consultation.id,
    fromUserId: Number(user.id),
    fromRole: String(user.role || 'client'),
    targetUserId: Number(metadata.peer_id),
    sentAt: Date.now(),
    ...extras,
  };
}

async function requestCallPermissions() {
  if (Platform.OS !== 'android') return true;

  const camera = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);

  return camera === PermissionsAndroid.RESULTS.GRANTED && mic === PermissionsAndroid.RESULTS.GRANTED;
}

export default function VideoCallScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { mode, consultationId, title } = useLocalSearchParams<{
    mode?: string;
    consultationId?: string;
    title?: string;
  }>();

  const webrtc = useMemo(() => loadWebRtcModule(), []);
  const RTCView = webrtc?.RTCView;
  const isConsultation = mode === 'consultation';
  const consultationIdNumber = Number(consultationId || 0);
  const isLawyer = user?.role === 'lawyer';
  const peerLabel = isLawyer ? 'client' : 'lawyer';
  const signalEventName = isLawyer ? 'lawyer-signal' : 'client-signal';
  const peerSignalEventName = isLawyer ? 'client-signal' : 'lawyer-signal';

  const echoRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const pcRef = useRef<PeerConnectionLike | null>(null);
  const localStreamRef = useRef<MediaStreamLike | null>(null);
  const remoteStreamRef = useRef<MediaStreamLike | null>(null);
  const pendingCandidatesRef = useRef<any[]>([]);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const [metadata, setMetadata] = useState<ConsultationVideoMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusTitle, setStatusTitle] = useState('Preparing secure call');
  const [statusCopy, setStatusCopy] = useState('Loading backend WebRTC metadata.');
  const [peerOnline, setPeerOnline] = useState(false);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const scheduledAtLabel = useMemo(
    () => formatCallDateTime(metadata?.consultation?.scheduled_at),
    [metadata?.consultation?.scheduled_at],
  );
  const callPartnerName = useMemo(() => {
    const raw = String(title || '').trim();
    if (raw && !raw.toLowerCase().includes('consultation')) return raw;
    if (metadata?.consultation?.code) return metadata.consultation.code;
    return isLawyer ? 'Client' : 'Your lawyer';
  }, [isLawyer, metadata?.consultation?.code, title]);

  function setCallStatus(nextTitle: string, nextCopy: string) {
    if (!mountedRef.current) return;
    setStatusTitle(nextTitle);
    setStatusCopy(nextCopy);
  }

  function callApi() {
    return isLawyer ? lawyerApi : clientApi;
  }

  function postSignalFallback(payload: SignalPayload | null) {
    if (!payload || !metadata?.consultation?.id) return;
    console.log('[VideoCall] queue signal', payload.type, 'to', payload.targetUserId);
    void callApi().consultationSignal(metadata.consultation.id, payload as unknown as Record<string, unknown>)
      .catch((fallbackError: any) => {
        console.warn('HTTP consultation signaling failed', fallbackError?.response?.data || fallbackError?.message || fallbackError);
      });
  }

  function whisper(payload: SignalPayload | null) {
    if (!payload) return;
    if (channelRef.current) {
      channelRef.current.whisper(signalEventName, payload);
      channelRef.current.whisper('signal', payload);
    }
    postSignalFallback(payload);
  }

  function closePeerConnection() {
    pcRef.current?.close?.();
    pcRef.current = null;
    pendingCandidatesRef.current = [];
  }

  function stopFallbackSignaling() {
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function stopLocalMedia() {
    localStreamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setLocalStreamUrl(null);
    setRemoteStreamUrl(null);
  }

  function leaveRealtime() {
    if (echoRef.current && metadata?.signaling_channel) {
      echoRef.current.leave(metadata.signaling_channel);
    }
    channelRef.current = null;
    echoRef.current?.disconnect?.();
    echoRef.current = null;
    stopFallbackSignaling();
  }

  function cleanup(sendHangup = true) {
    if (sendHangup && metadata && user) {
      whisper(createSignal(metadata, user, 'hangup'));
    }
    closePeerConnection();
    leaveRealtime();
    stopLocalMedia();
  }

  async function ensureLocalMedia() {
    if (!webrtc) throw new Error('Native WebRTC is unavailable. Install and open the LexConnect development build, not Expo Go.');
    const existingVideoTracks = localStreamRef.current?.getVideoTracks?.() || [];
    const hasLiveVideo = existingVideoTracks.some((track: any) => track.readyState !== 'ended');
    if (localStreamRef.current && hasLiveVideo) return localStreamRef.current;

    if (localStreamRef.current && !hasLiveVideo) {
      localStreamRef.current.getTracks?.().forEach((track: any) => track.stop?.());
      localStreamRef.current = null;
      setLocalStreamUrl(null);
    }

    const allowed = await requestCallPermissions();
    if (!allowed) throw new Error('Camera and microphone permissions are required.');

    let stream: MediaStreamLike;
    try {
      stream = await webrtc.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: 640,
          height: 480,
          frameRate: 24,
        },
      });
    } catch (mediaError: any) {
      throw new Error(mediaError?.message || 'Unable to open the camera or microphone.');
    }

    localStreamRef.current = stream;
    const streamUrl = stream.toURL?.();
    const videoTracks = stream.getVideoTracks?.() || [];
    if (!videoTracks.length) {
      throw new Error('Camera permission is granted, but no camera video track was returned.');
    }
    videoTracks.forEach((track: any) => {
      track.enabled = true;
    });
    if (!streamUrl) {
      throw new Error('Camera stream opened, but no preview URL was returned.');
    }
    setLocalStreamUrl(streamUrl);
    setCameraOff(false);
    return stream;
  }

  function showRemoteStream(stream: any) {
    if (!stream) return;
    remoteStreamRef.current = stream;
    const url = stream.toURL?.();
    if (url) setRemoteStreamUrl(url);
    setCallStatus('Call connected', `You are now connected to the ${peerLabel}.`);
  }

  function handleRemoteTrack(event: any) {
    const stream = event?.streams?.[0] || event?.stream;
    if (stream) {
      showRemoteStream(stream);
      return;
    }

    if (event?.track && webrtc?.MediaStream) {
      const nextStream = remoteStreamRef.current || new webrtc.MediaStream();
      const existingTracks = nextStream.getTracks?.() || [];
      const exists = existingTracks.some((track: any) => track.id === event.track.id);
      if (!exists) nextStream.addTrack(event.track);
      showRemoteStream(nextStream);
    }
  }

  async function flushPendingCandidates(pc: PeerConnectionLike) {
    if (!pc.remoteDescription) return;
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await pc.addIceCandidate(new webrtc.RTCIceCandidate(candidate));
    }
  }

  function createPeerConnection() {
    if (pcRef.current) return pcRef.current;
    if (!metadata) throw new Error('Missing consultation metadata.');

    const pc = new webrtc.RTCPeerConnection({
      iceServers: metadata.ice_servers?.length ? metadata.ice_servers : [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStreamRef.current?.getTracks?.().forEach((track: any) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (event: any) => {
      if (!event.candidate || !metadata || !user) return;
      const candidate = serializeIceCandidate(event.candidate);
      if (candidate?.candidate) {
        whisper(createSignal(metadata, user, 'ice-candidate', { candidate }));
      }
    };

    pc.ontrack = handleRemoteTrack;
    pc.onaddstream = handleRemoteTrack;
    pc.onconnectionstatechange = () => {
      const state = String(pc.connectionState || '');
      if (state === 'connected') {
        setCallStatus('Call connected', `You are now connected to the ${peerLabel}.`);
      } else if (state === 'failed' || state === 'disconnected') {
        setCallStatus('Connection interrupted', 'Tap reconnect to renegotiate the WebRTC call.');
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function createOffer() {
    if (!metadata || !user) return;
    await ensureLocalMedia();
    const pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const localOffer = serializeSessionDescription(pc.localDescription || offer);
    if (!localOffer) throw new Error('Could not create a valid WebRTC offer.');
    whisper(createSignal(metadata, user, 'offer', { sdp: localOffer }));
    setCallStatus('Offer sent', `Waiting for the ${peerLabel} to answer.`);
  }

  function reportSignalError(signalError: unknown) {
    const message = signalError instanceof Error ? signalError.message : String(signalError);
    console.warn('[VideoCall] signaling error', message);
    setError(message);
    setCallStatus('Call setup error', message);
  }

  function safelyHandleSignal(payload: SignalPayload) {
    void handleSignal(payload).catch(reportSignalError);
  }

  async function handleSignal(payload: SignalPayload) {
    if (!metadata || !user || !payload) return;
    if (Number(payload.fromUserId) === Number(user.id)) return;
    if (Number(payload.targetUserId) !== Number(user.id)) return;
    if (payload.signalId) {
      if (processedSignalIdsRef.current.has(payload.signalId)) return;
      processedSignalIdsRef.current.add(payload.signalId);
    }

    console.log('[VideoCall] received signal', payload.type, 'from', payload.fromUserId);

    if (payload.type === 'peer-ready') {
      setCallStatus(`${peerLabel[0].toUpperCase()}${peerLabel.slice(1)} ready`, 'Preparing WebRTC negotiation.');
      if (metadata.is_offer_initiator || isLawyer) {
        await createOffer();
      }
      return;
    }

    if (payload.type === 'hangup') {
      setCallStatus('Call ended', `The ${peerLabel} left the consultation.`);
      closePeerConnection();
      return;
    }

    if (payload.type === 'consultation-ended') {
      setCallStatus('Consultation ended', `The ${peerLabel} ended the consultation.`);
      closePeerConnection();
      if (!isLawyer) {
        setTimeout(() => {
          if (!mountedRef.current) return;
          router.replace({
            pathname: '/(client)/payments',
            params: {
              consultationId: String(payload.consultationId || metadata.consultation.id),
              fromSessionEnd: '1',
            },
          } as any);
        }, 700);
      }
      return;
    }

    if (payload.type === 'audio-muted') {
      return;
    }

    await ensureLocalMedia();
    const pc = createPeerConnection();

    if (payload.type === 'offer') {
      setCallStatus('Offer received', `Creating answer for the ${peerLabel}.`);
      const remoteOffer = normalizeSessionDescription(payload.sdp, 'offer');
      if (!remoteOffer) {
        console.warn('[VideoCall] invalid offer payload', payload);
        throw new Error('Received an invalid WebRTC offer from the lawyer.');
      }
      await pc.setRemoteDescription(remoteOffer);
      await flushPendingCandidates(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const localAnswer = serializeSessionDescription(pc.localDescription || answer);
      if (!localAnswer) throw new Error('Could not create a valid WebRTC answer.');
      whisper(createSignal(metadata, user, 'answer', { sdp: localAnswer }));
      setCallStatus('Answer sent', 'Finishing secure media connection.');
      return;
    }

    if (payload.type === 'answer') {
      if (String(pc.signalingState || '') !== 'have-local-offer') {
        console.log('[VideoCall] ignored stale answer while in state', pc.signalingState);
        return;
      }

      setCallStatus('Answer received', 'Applying remote answer and checking media route.');
      const remoteAnswer = normalizeSessionDescription(payload.sdp, 'answer');
      if (!remoteAnswer) {
        console.warn('[VideoCall] invalid answer payload', payload);
        throw new Error('Received an invalid WebRTC answer from the client.');
      }
      await pc.setRemoteDescription(remoteAnswer);
      await flushPendingCandidates(pc);
      setCallStatus('Answer received', 'Secure media is finalizing.');
      return;
    }

    if (payload.type === 'ice-candidate' && payload.candidate) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new webrtc.RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    }
  }

  async function joinSignalingChannel() {
    if (!metadata || !token || !user || channelRef.current) return;
    if (!isReverbConfigured()) throw new Error('Reverb is not configured.');

    const echo = createReverbEcho(token, metadata.broadcast_auth_endpoint);
    echoRef.current = echo;

    const channel = echo.join(metadata.signaling_channel)
      .here((members: Array<{ id: number }>) => {
        const online = members.some((member) => Number(member.id) === Number(metadata.peer_id));
        setPeerOnline(online);
        setCallStatus(
          online ? `${peerLabel[0].toUpperCase()}${peerLabel.slice(1)} online` : `Waiting for the ${peerLabel}`,
          `Joined WebRTC signaling channel ${metadata.signaling_channel}.`,
        );

        if (online) {
          if (metadata.is_offer_initiator || isLawyer) {
            void createOffer();
          } else {
            whisper(createSignal(metadata, user, 'peer-ready'));
          }
        }
      })
      .joining((member: { id: number }) => {
        if (Number(member.id) !== Number(metadata.peer_id)) return;
        setPeerOnline(true);
        if (metadata.is_offer_initiator || isLawyer) {
          void createOffer();
        } else {
          whisper(createSignal(metadata, user, 'peer-ready'));
        }
      })
      .leaving((member: { id: number }) => {
        if (Number(member.id) !== Number(metadata.peer_id)) return;
        setPeerOnline(false);
        setCallStatus(`Waiting for the ${peerLabel}`, `The ${peerLabel} left the signaling channel.`);
      })
      .listenForWhisper(peerSignalEventName, (payload: SignalPayload) => {
        safelyHandleSignal(payload);
      })
      .listenForWhisper('signal', (payload: SignalPayload) => {
        safelyHandleSignal(payload);
      })
      .error((subscriptionError: unknown) => {
        console.error('Consultation signaling subscription error', subscriptionError);
        setError('Could not join Reverb signaling for this consultation.');
      });

    channelRef.current = channel;
    startFallbackSignaling();
  }

  function startFallbackSignaling() {
    if (!metadata?.consultation?.id || fallbackTimerRef.current) return;

    const tick = async () => {
      try {
        const apiForRole = callApi();
        const [heartbeatResponse, signalsResponse] = await Promise.all([
          apiForRole.consultationHeartbeat(metadata.consultation.id),
          apiForRole.consultationSignals(metadata.consultation.id),
        ]);

        if (typeof heartbeatResponse?.data?.peer_online === 'boolean') {
          setPeerOnline(Boolean(heartbeatResponse.data.peer_online));
        }

        const signals = Array.isArray(signalsResponse?.data?.signals) ? signalsResponse.data.signals : [];
        if (signals.length > 0) {
          console.log('[VideoCall] pulled fallback signals', signals.map((signal: SignalPayload) => signal.type).join(', '));
        }
        signals.forEach((signal: SignalPayload) => {
          safelyHandleSignal(signal);
        });
      } catch (fallbackError: any) {
        console.warn('HTTP consultation signaling poll failed', fallbackError?.response?.data || fallbackError?.message || fallbackError);
      }
    };

    void tick();
    fallbackTimerRef.current = setInterval(tick, 1200);
  }

  async function loadMetadata() {
    if (!user || !consultationIdNumber) return;
    setLoading(true);
    setError('');
    try {
      const response = isLawyer
        ? await lawyerApi.consultationVideo(consultationIdNumber)
        : await clientApi.consultationVideo(consultationIdNumber);
      const nextMetadata = response.data as ConsultationVideoMetadata;
      setMetadata(nextMetadata);

      if (!nextMetadata.can_join) {
        setCallStatus('Consultation not open yet', `This call can be joined starting ${formatDateTime(nextMetadata.join_opens_at)}.`);
      } else {
        setCallStatus('Starting native WebRTC', 'Initializing camera, microphone, and Reverb signaling.');
      }
    } catch (metadataError: any) {
      const message = String(metadataError?.response?.data?.message || metadataError?.message || 'Unable to load video metadata.');
      setError(message);
      setCallStatus('Unable to load call', message);
    } finally {
      setLoading(false);
    }
  }

  async function startCall() {
    if (!metadata || !metadata.can_join) return;
    setBusy(true);
    setError('');
    try {
      await ensureLocalMedia();
      startFallbackSignaling();
      await joinSignalingChannel();
    } catch (startError: any) {
      const message = String(startError?.message || 'Unable to start native WebRTC call.');
      setError(message);
      setCallStatus('Call setup failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function reconnect() {
    cleanup(false);
    setRemoteStreamUrl(null);
    setLocalStreamUrl(null);
    setPeerOnline(false);
    processedSignalIdsRef.current = new Set();
    if (metadata?.can_join) {
      await startCall();
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks?.().forEach((track: any) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }

  function toggleCamera() {
    const nextCameraOff = !cameraOff;
    localStreamRef.current?.getVideoTracks?.().forEach((track: any) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
  }

  function toggleFullScreen() {
    setFullScreen((current) => !current);
  }

  function leaveCall() {
    cleanup(true);
    router.back();
  }

  useEffect(() => {
    mountedRef.current = true;
    void loadMetadata();

    return () => {
      mountedRef.current = false;
      cleanup(false);
    };
  }, [consultationIdNumber, user?.id]);

  useEffect(() => {
    if (metadata?.can_join && webrtc) {
      void startCall();
    }
  }, [metadata?.can_join, metadata?.signaling_channel, webrtc]);

  useEffect(() => {
    if (!metadata || metadata.can_join || isLawyer || !consultationIdNumber) return;

    const timer = setInterval(() => {
      void clientApi.consultationStatus(consultationIdNumber)
        .then((response) => {
          if (!mountedRef.current || !response?.data?.lawyer_in_video_call) return;
          setMetadata((current) => current ? { ...current, can_join: true } : current);
          setCallStatus('Lawyer is ready', 'Your lawyer opened the session. Starting the secure call.');
        })
        .catch(() => {
          // Keep waiting quietly while the scheduled time is still locked.
        });
    }, 1500);

    return () => clearInterval(timer);
  }, [metadata?.can_join, metadata?.consultation?.id, isLawyer, consultationIdNumber]);

  if (!isConsultation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerCard}>
          <Ionicons name="videocam-off-outline" size={46} color="#BFDBFE" />
          <Text style={styles.centerTitle}>Native WebRTC only</Text>
          <Text style={styles.centerCopy}>Only one-to-one consultation calls are supported in this native WebRTC screen.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, fullScreen && styles.containerFullScreen]}>
      {!fullScreen ? (
        <View style={styles.callHeaderCard}>
          <View style={styles.brandIcon}>
            <Ionicons name="scale-outline" size={26} color="#EAF6FF" />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title} numberOfLines={1}>LexConnect Consultation Call</Text>
            <Text style={styles.subtitle} numberOfLines={2}>Private one-to-one session with {callPartnerName}</Text>
          </View>
          <View style={styles.headerPills}>
            <View style={[styles.presencePill, peerOnline ? styles.presenceOnline : styles.presenceWaiting]}>
              <Ionicons name="people" size={14} color={peerOnline ? '#67E8F9' : '#FBBF24'} />
              <Text style={styles.presenceText}>
                {peerOnline ? `${callPartnerName} is on this consultation page` : `Waiting for ${peerLabel}`}
              </Text>
            </View>
            <View style={styles.datePill}>
              <Ionicons name="calendar" size={14} color="#D9E4F5" />
              <Text style={styles.datePillText}>{scheduledAtLabel}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[styles.content, fullScreen && styles.contentFullScreen]}>
        <View style={[styles.stage, fullScreen && styles.stageFullScreen]}>
          {remoteStreamUrl && RTCView ? (
            <RTCView streamURL={remoteStreamUrl} style={styles.remoteVideo} objectFit="cover" />
          ) : (
            <View style={styles.remotePlaceholder}>
              {loading || busy ? (
                <ActivityIndicator color="#5EEAD4" size="large" />
              ) : (
                <View style={styles.remoteAvatar}>
                  <Ionicons name="person-outline" size={62} color="#DCEAFF" />
                </View>
              )}
              <Text style={styles.stageTitle}>{statusTitle}</Text>
              <Text style={styles.stageCopy}>{statusCopy}</Text>
            </View>
          )}

          <View style={styles.localTile}>
            {localStreamUrl && RTCView && !cameraOff ? (
              <RTCView streamURL={localStreamUrl} style={styles.localVideo} objectFit="cover" mirror zOrder={1} />
            ) : (
              <View style={styles.localPlaceholder}>
                <Ionicons name={cameraOff ? 'videocam-off-outline' : 'videocam-outline'} size={30} color="#E0E7FF" />
              </View>
            )}
            <Text style={styles.localLabel}>You</Text>
          </View>

          {fullScreen ? (
            <TouchableOpacity style={styles.fullScreenExitBtn} onPress={toggleFullScreen}>
              <Ionicons name="contract-outline" size={18} color="#FFFFFF" />
              <Text style={styles.fullScreenExitText}>Exit Full Screen</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {!fullScreen ? (
          <ScrollView
            style={styles.detailsScroll}
            contentContainerStyle={styles.detailsContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sessionPanel}>
              <View style={styles.statusBlock}>
                <Text style={styles.statusTitle}>{statusTitle}</Text>
                <Text style={styles.statusCopy}>{statusCopy}</Text>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </View>

              <View style={styles.detailCard}>
                <Text style={styles.detailEyebrow}>Call Details</Text>
                <Text style={styles.detailName} numberOfLines={1}>{callPartnerName}</Text>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Calling</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{callPartnerName}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Date & Time</Text>
                  <Text style={styles.detailValue}>{scheduledAtLabel}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>

      <View style={[styles.controls, fullScreen && styles.controlsFullScreen]}>
        <TouchableOpacity style={[styles.controlButton, muted && styles.controlButtonDanger]} onPress={toggleMute} disabled={!localStreamUrl}>
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={24} color="#fff" />
          <Text style={styles.controlText}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, cameraOff && styles.controlButtonDanger]} onPress={toggleCamera} disabled={!localStreamUrl}>
          <Ionicons name={cameraOff ? 'videocam-off' : 'videocam'} size={24} color="#fff" />
          <Text style={styles.controlText}>{cameraOff ? 'Camera Off' : 'Camera'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} disabled>
          <Ionicons name="desktop-outline" size={24} color="#94A3B8" />
          <Text style={[styles.controlText, styles.controlTextDisabled]}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, fullScreen && styles.controlButtonActive]} onPress={toggleFullScreen}>
          <Ionicons name={fullScreen ? 'contract-outline' : 'expand-outline'} size={24} color="#fff" />
          <Text style={styles.controlText}>{fullScreen ? 'Exit Full' : 'Full Screen'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={reconnect} disabled={busy || !metadata?.can_join}>
          <Ionicons name="refresh" size={24} color="#fff" />
          <Text style={styles.controlText}>Reconnect</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, styles.leaveButton]} onPress={leaveCall}>
          <Ionicons name="call" size={24} color="#fff" />
          <Text style={styles.controlText}>Leave</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020817',
    paddingHorizontal: 12,
  },
  containerFullScreen: {
    paddingHorizontal: 0,
    backgroundColor: '#000000',
  },
  callHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#071221',
    borderWidth: 1,
    borderColor: '#17243A',
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1185EE',
    shadowColor: '#1185EE',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#172033',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 180,
  },
  title: {
    color: '#F8FBFF',
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    color: '#AAB7CA',
    fontSize: 12,
    marginTop: 3,
  },
  headerPills: {
    width: '100%',
    gap: 8,
  },
  presencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  presenceOnline: {
    backgroundColor: 'rgba(8, 145, 178, 0.22)',
    borderColor: 'rgba(34, 211, 238, 0.28)',
  },
  presenceWaiting: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(245, 158, 11, 0.26)',
  },
  presenceDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  dotOnline: {
    backgroundColor: '#34D399',
  },
  dotWaiting: {
    backgroundColor: '#F59E0B',
  },
  presenceText: {
    color: '#DDFBFF',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0E1728',
    borderWidth: 1,
    borderColor: '#1D2B45',
  },
  datePillText: {
    color: '#D9E4F5',
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    gap: 12,
  },
  contentFullScreen: {
    gap: 0,
  },
  stage: {
    height: 300,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#050B14',
    borderWidth: 1,
    borderColor: '#17243A',
  },
  stageFullScreen: {
    flex: 1,
    height: undefined,
    borderRadius: 0,
    borderWidth: 0,
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#020617',
  },
  remotePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: '#07111F',
  },
  remoteAvatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111C31',
    borderWidth: 1,
    borderColor: '#253756',
  },
  stageTitle: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 16,
  },
  stageCopy: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  localTile: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    elevation: 10,
    width: 102,
    height: 136,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: '#1E293B',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  localPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localLabel: {
    position: 'absolute',
    left: 10,
    top: 10,
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  fullScreenExitBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 12,
    elevation: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  fullScreenExitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  statusCard: {
    marginTop: 16,
    borderRadius: 24,
    backgroundColor: '#101827',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
  },
  sessionPanel: {
    gap: 12,
  },
  detailsScroll: {
    flex: 1,
  },
  detailsContent: {
    paddingBottom: 18,
  },
  statusBlock: {
    borderRadius: 18,
    backgroundColor: '#06101E',
    padding: 16,
    borderWidth: 1,
    borderColor: '#17243A',
  },
  statusTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  statusCopy: {
    color: '#C4D0E3',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  detailCard: {
    borderRadius: 22,
    backgroundColor: '#06101E',
    padding: 18,
    borderWidth: 1,
    borderColor: '#17243A',
  },
  detailEyebrow: {
    color: '#63A6F6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailName: {
    color: '#F8FBFF',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 14,
  },
  detailItem: {
    borderRadius: 16,
    backgroundColor: '#101A2B',
    borderWidth: 1,
    borderColor: '#1B2A43',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 10,
  },
  detailLabel: {
    color: '#63A6F6',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  detailValue: {
    color: '#F8FBFF',
    fontSize: 16,
    fontWeight: '900',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  metaPill: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaLabel: {
    color: '#93A4BD',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 14,
  },
  controlsFullScreen: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 20,
    elevation: 20,
    paddingTop: 0,
    paddingBottom: 0,
  },
  controlButton: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 62,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#111B2D',
    borderWidth: 1,
    borderColor: '#24344F',
  },
  controlButtonDanger: {
    backgroundColor: '#371522',
    borderColor: '#7F1D1D',
  },
  controlButtonActive: {
    backgroundColor: '#123154',
    borderColor: '#38BDF8',
  },
  leaveButton: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
  },
  controlText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  controlTextDisabled: {
    color: '#94A3B8',
  },
  centerCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centerTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 18,
  },
  centerCopy: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
  },
  primaryButton: {
    marginTop: 22,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});
