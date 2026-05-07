# Video Call Server Setup

This mobile app currently opens Jitsi rooms for video calls. The Laravel/API server at `http://192.168.110.252/` does not stream video by itself unless a video server is installed and exposed separately.

## What is already true in the app

- The mobile app uses the normal API server for app data, auth, and realtime app events.
- The mobile app uses Jitsi room URLs for video calls.
- Camera and microphone access are requested on Android before joining a call.
- The app now respects the configured Jitsi domain instead of forcing `meet.jit.si`.

## If `192.168.110.252` will host Jitsi

Tell the server team to provide a working Jitsi Meet server on that host.

Minimum requirement:

- A Jitsi web server reachable at `https://192.168.110.252/<roomName>`
- Jitsi Videobridge enabled for media relay
- STUN/TURN configured for devices on different networks
- Ports opened for Jitsi traffic
- Valid HTTPS certificate if calls will be used outside simple LAN testing

Recommended ports:

- `443/TCP` for HTTPS
- `10000/UDP` for Jitsi media
- `3478/UDP` for STUN/TURN

Then set this in the mobile `.env`:

```env
EXPO_PUBLIC_JAAS_APP_ID=
EXPO_PUBLIC_JAAS_DOMAIN=192.168.110.252
EXPO_PUBLIC_JAAS_ROOM_PREFIX=lexconnect
EXPO_PUBLIC_JAAS_JWT=
```

## If `192.168.110.252` is only the Laravel/API server

Tell the server team this:

1. Keep the Laravel API on `http://192.168.110.252`.
2. Add or deploy a separate Jitsi server for video calls, or use `meet.jit.si`.
3. If you want app-controlled ringing, accept/reject, missed calls, and sync between web and mobile, implement the call signaling contract in `MOBILE_WEB_CHAT_VIDEO_CONTRACT.md`.

## What to ask the server developer to add

Send this message:

```text
We already have the mobile app opening Jitsi rooms for video calls. Please add proper video-call backend support for call sync and participant signaling.

Required server work:

1. Provide a Jitsi server endpoint if calls should run on our infrastructure.
   - Host: 192.168.110.252 or another domain
   - Must support HTTPS
   - Must have Jitsi Videobridge
   - Must have STUN/TURN for reliable NAT traversal
   - Open required ports: 443/TCP, 10000/UDP, 3478/UDP

2. Implement call signaling in the app backend:
   - POST /api/calls/start
   - POST /api/calls/{callId}/accept
   - POST /api/calls/{callId}/reject
   - POST /api/calls/{callId}/end
   - Realtime events:
     - call.incoming
     - call.accepted
     - call.rejected
     - call.ended
     - call.timeout
     - call.offer
     - call.answer
     - call.ice

3. Only conversation or group participants should be able to join call channels.

4. Persist call records with:
   - call_id
   - conversation_id or group_id
   - started_by
   - status
   - created_at
   - ended_at

5. If screen sharing is required:
   - Jitsi server must allow screen sharing
   - For mobile support, confirm Android/iOS compatibility in the chosen Jitsi client flow
```

## Web -> Mobile Incoming Call Behavior

If the web app starts a 1:1 or group call and mobile should join the same room, the backend should send a realtime event to the mobile user immediately.

The easiest backward-compatible option in this project is:

- send a normal message event on the existing private user message channel
- put a call signal object in the message body
- include the same `conversation_id` or `group_id` used by both web and mobile

Current mobile call-signal body format:

```text
__LC_CALL__{"v":1,"type":"invite","mode":"one-on-one","conversationId":123,"title":"Video Call","fromName":"Lawyer Name"}
```

Group example:

```text
__LC_CALL__{"v":1,"type":"invite","mode":"group","groupId":99,"title":"Team Meeting","fromName":"Lawyer Name"}
```

Required fields:

- `v: 1`
- `type: "invite"` or `"decline"`
- `mode: "one-on-one"` or `"group"`
- `conversationId` for direct calls
- `groupId` for group calls
- `title` optional but recommended
- `fromName` optional but recommended

Expected result:

- mobile receives the realtime event
- mobile shows an incoming call notification/banner
- tapping it opens the correct mobile video-call screen
- mobile joins the same Jitsi room because both sides use the same conversation/group identifiers

## Important limitation

If the app opens calls in the browser or external Jitsi app, screen sharing depends on that client and platform support. It is not controlled by the Laravel API alone.
