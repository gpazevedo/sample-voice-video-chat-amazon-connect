/**
 * Session management data models and interfaces
 */

import { ParticipantDetails } from './call';

/**
 * Session context maintaining state across channels
 */
export interface SessionContext {
  webrtcContactId?: string;
  webrtcContactArn?: string;
  chatContactId?: string;
  agentId?: string;
  participantDetails: ParticipantDetails;
  startTime: Date;
  lastActivityTime: Date;
}

/**
 * Current session state
 */
export interface SessionState {
  webrtcActive: boolean;
  chatActive: boolean;
  agentConnected: boolean;
}
