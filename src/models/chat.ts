/**
 * Chat-related data models and interfaces
 */

import { ParticipantDetails } from './call';

/**
 * Configuration for initiating a chat session
 */
export interface ChatConfig {
  instanceId: string;
  contactFlowId: string;
  participantDetails: ParticipantDetails;
  relatedContactId: string;
  /**
   * Routing attributes passed to the contact flow
   * Expected attributes:
   * - AgentId: The agent ID to route the chat to (must match contact flow attribute name)
   * - QueueId: The queue ID for fallback routing (optional)
   */
  routingAttributes: Record<string, string>;
  supportedContentTypes?: string[];
}

/**
 * Active chat session information
 */
export interface ChatSession {
  contactId: string;
  participantId: string;
  participantToken: string;
  connectionToken: string;
  websocketUrl: string;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  type: 'MESSAGE' | 'EVENT' | 'ATTACHMENT';
  contentType: string;
  content: string;
  displayName: string;
  participantRole: 'AGENT' | 'CUSTOMER';
  timestamp: Date;
  attachments?: AttachmentInfo[];
}

/**
 * File attachment information
 */
export interface AttachmentInfo {
  attachmentId: string;
  attachmentName: string;
  contentType: string;
  status: 'APPROVED' | 'REJECTED' | 'IN_PROGRESS';
}
