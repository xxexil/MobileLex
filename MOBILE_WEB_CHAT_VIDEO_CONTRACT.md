# Mobile <-> Web Chat + Video Call Contract (LexConnect)

Date: 2026-04-20

This document is ready to send to backend/server developers to close missing features between Mobile and Web for:
- File sending
- Photo sending
- Video call signaling

## 1. Copy/Paste Message To Server Team

Please implement missing cross-platform communication features so Mobile to Web and Web to Mobile work consistently:

1. Chat file sending for common docs and media.
2. Photo sending with image preview support.
3. Video call signaling for WebRTC (start, incoming, accept/reject, ICE exchange, end, missed).

Current status in our codebase:
- 1:1 chat already supports attachment upload in API for client/lawyer/lawfirm.
- Group chat currently supports text only and needs attachment support.
- Realtime message events exist, but call signaling API/events are not standardized yet.

Required outcomes:
1. Mobile user can send file/photo and Web receives instantly.
2. Web user can send file/photo and Mobile receives instantly.
3. Attachment metadata is persisted and returned in history APIs.
4. Video call signaling works for incoming, accept/reject, answer/offer/ICE, timeout, and end.
5. Only conversation/group participants can access messages, files, and call channels.

## 2. Existing Endpoints Already Working (Do Not Break)

### 1:1 message send endpoints (already attachment-capable)
- POST /api/client/messages/send
- POST /api/lawyer/messages/send
- POST /api/lawfirm/messages/send

Existing request shape:
- conversation_id (required)
- body (nullable, required_without attachment)
- attachment (nullable file, required_without body)

Existing attachment constraints:
- max 20480 KB (20 MB)
- mimes: jpg,jpeg,png,gif,webp,pdf,doc,docx,txt,m4a,mp3,wav,ogg,aac,heic,heif

Existing response includes:
- id
- body
- sender_id
- created_at
- attachment_url
- attachment_name
- attachment_type

### Existing realtime message event
- Event: MessageSent
- Channels:
  - private-conversation.{conversationId}
  - private-user.{userId}.messages

## 3. Missing Features To Add

### A. Group Chat Attachments (File + Photo)

Current group API is text only:
- GET /api/groups/{groupId}/messages
- POST /api/groups/{groupId}/messages

Please extend group message API to support attachment input/output exactly like 1:1 chat.

Proposed request for POST /api/groups/{groupId}/messages:
- sender_id (required, must match auth user)
- content (nullable if attachment provided)
- attachment (nullable file, required_without content)

Proposed response fields for each group message:
- id
- group_id
- sender_id
- content
- created_at
- attachment_url
- attachment_name
- attachment_type (image | audio | file)
- attachment_size
- attachment_mime

Proposed DB update for group_messages table:
- attachment_path nullable string
- attachment_name nullable string
- attachment_type nullable string
- attachment_size nullable bigint
- attachment_mime nullable string

Broadcast for group chat:
- Keep existing GroupMessageSent channel naming (private-group.{groupId})
- Include attachment fields in broadcast payload

### B. Standardized Attachment Types

Server should normalize attachment_type:
- image: image/*
- audio: audio/*
- file: everything else

Server should also return:
- attachment_ext
- attachment_size
- attachment_mime

Validation rules:
- Max size: 20 MB (or configurable env value)
- Reject unknown/blocked mime types with 422
- Enforce participant authorization before upload and before history read

### C. Video Call Signaling API + Realtime Events

Add API + websocket/reverb contract for WebRTC signaling between mobile and web.

Recommended API (REST fallback + audit trail):

1) POST /api/calls/start
Request:
- conversation_id or group_id (one required)
- call_type: video
- mode: one-on-one | group

Response:
- call_id
- status: ringing
- started_by
- created_at

2) POST /api/calls/{callId}/accept
Response:
- call_id
- status: accepted

3) POST /api/calls/{callId}/reject
Response:
- call_id
- status: rejected

4) POST /api/calls/{callId}/end
Response:
- call_id
- status: ended
- ended_at

Recommended realtime events (primary transport):
- call.incoming
- call.accepted
- call.rejected
- call.ended
- call.timeout
- call.offer
- call.answer
- call.ice

Recommended payload envelope for signaling events:
- call_id
- from_user_id
- to_user_id (for 1:1) or group_id (for group)
- conversation_id (if 1:1)
- mode
- call_type
- sdp (for offer/answer only)
- candidate (for ICE only)
- created_at

Suggested channels:
- private-conversation.{conversationId}
- private-group.{groupId}
- private-user.{userId}.calls

Authorization rule:
- Only participants of the conversation/group can subscribe or send signaling events.

## 4. API Examples

### Send 1:1 message with file (multipart)
POST /api/client/messages/send
Fields:
- conversation_id: 123
- body: Please review this draft.
- attachment: contract.pdf

Response:
{
  "id": 456,
  "body": "Please review this draft.",
  "sender_id": 77,
  "created_at": "2026-04-20T10:00:00Z",
  "attachment_url": "https://.../storage/chat-attachments/abc.pdf",
  "attachment_name": "contract.pdf",
  "attachment_type": "file"
}

### Send group photo (multipart)
POST /api/groups/99/messages
Fields:
- sender_id: 77
- content: optional caption
- attachment: image.jpg

Response:
{
  "message": {
    "id": 9001,
    "group_id": 99,
    "sender_id": 77,
    "content": "optional caption",
    "created_at": "2026-04-20T10:05:00Z",
    "attachment_url": "https://.../storage/chat-attachments/photo.jpg",
    "attachment_name": "photo.jpg",
    "attachment_type": "image",
    "attachment_size": 245678,
    "attachment_mime": "image/jpeg"
  }
}

### Call start
POST /api/calls/start
{
  "conversation_id": 123,
  "call_type": "video",
  "mode": "one-on-one"
}

Response:
{
  "call_id": "c_20260420_001",
  "status": "ringing",
  "started_by": 77,
  "created_at": "2026-04-20T10:10:00Z"
}

### Realtime signaling event example
Event: call.offer
{
  "call_id": "c_20260420_001",
  "from_user_id": 77,
  "to_user_id": 88,
  "conversation_id": 123,
  "mode": "one-on-one",
  "call_type": "video",
  "sdp": { "type": "offer", "sdp": "..." },
  "created_at": "2026-04-20T10:10:10Z"
}

## 5. Acceptance Checklist

1. Client (mobile) -> lawyer (web): file and photo deliver realtime and persist in history.
2. Lawyer (web) -> client (mobile): file and photo deliver realtime and persist in history.
3. Group chats can send and receive file/photo both directions.
4. Unsupported file types are rejected with readable 422 errors.
5. Video calls can ring, accept/reject, exchange offer/answer/ICE, and end successfully.
6. Offline receiver gets missed-call or pending-message notification on reconnect.
7. Auth checks prevent non-participants from accessing conversations, groups, files, and call events.

## 6. Notes For Implementation

- Keep current endpoint behavior and payload keys for backward compatibility.
- Do not remove existing MessageSent or GroupMessageSent events.
- Add new fields in a backward-compatible way (nullable in DB and optional in serializers).
- Use storage symlink/public disk conventions already used by existing message attachments.
