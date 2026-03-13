/**
 * Call-related data models and interfaces for WebRTC communication
 */

/**
 * Configuration for initiating a call
 */
export interface CallConfig {
  instanceId: string;
  contactFlowId: string;
  participantDetails: ParticipantDetails;
  allowedCapabilities?: AllowedCapabilities;
  attributes?: Record<string, string>;
}

/**
 * Participant details for a call or chat session
 */
export interface ParticipantDetails {
  displayName: string;
}

/**
 * Allowed capabilities for call participants
 */
export interface AllowedCapabilities {
  customer: ParticipantCapabilities;
  agent: ParticipantCapabilities;
}

/**
 * Capabilities for a single participant
 */
export interface ParticipantCapabilities {
  video: 'SEND' | 'NONE';
  screenShare: 'SEND' | 'NONE';
}

/**
 * Active call session information
 */
export interface CallSession {
  contactId: string;
  contactArn: string;
  participantId: string;
  participantToken: string;
  connectionData: ConnectionData;
}

/**
 * Connection data for Chime SDK initialization
 */
export interface ConnectionData {
  meeting: MeetingInfo;
  attendee: AttendeeInfo;
}

/**
 * Chime meeting information
 */
export interface MeetingInfo {
  meetingId: string;
  mediaRegion: string;
  mediaPlacement: MediaPlacement;
  meetingFeatures?: MeetingFeatures;
}

/**
 * Media placement URLs for Chime SDK
 */
export interface MediaPlacement {
  audioHostUrl: string;
  audioFallbackUrl: string;
  signalingUrl: string;
  turnControlUrl: string;
  eventIngestionUrl: string;
}

/**
 * Meeting features configuration
 */
export interface MeetingFeatures {
  audio: {
    echoReduction: 'AVAILABLE' | 'UNAVAILABLE';
  };
}

/**
 * Attendee information for Chime SDK
 */
export interface AttendeeInfo {
  attendeeId: string;
  joinToken: string;
}

/**
 * Connection quality metrics
 */
export interface ConnectionQuality {
  audioPacketLoss: number;
  videoPacketLoss: number;
  roundTripTime: number;
}
