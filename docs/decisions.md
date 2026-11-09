# Decisions log

## 2026-11-09: Click-feedback loader via custom LoadingLink
- Decision: added components/LoadingLink.tsx (wraps next/link; spinner + blocks repeat clicks until pathname changes, 10s safety timeout). Used in Header, PacketsView, PacketReader, VideoResourcesReader.
- Reason: Next 14.2.13 has no useLinkStatus; users saw no feedback on slow server-rendered routes.
- Rejected: upgrading Next for useLinkStatus (out of scope); spinners on external/new-tab links (opens instantly, misleading).
