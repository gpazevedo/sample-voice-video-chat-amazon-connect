/**
 * ChatManager - Placeholder retained for SessionManager wiring compatibility.
 *
 * Chat is handled entirely by the Amazon Connect Chat Standard Widget
 * (amazon_connect() API in index.html). This class exists only to satisfy
 * the SessionManager/AmazonConnectApp interface; none of its callbacks
 * are triggered in the widget-based flow.
 */

export class ChatManager {
  private chatEstablishedCallbacks: Array<() => void> = [];
  private chatFailedCallbacks: Array<(error: Error) => void> = [];
  private messageReceivedCallbacks: Array<(message: any) => void> = [];
  private typingIndicatorCallbacks: Array<(isTyping: boolean) => void> = [];
  private chatEndedCallbacks: Array<() => void> = [];

  constructor(_region?: string, _credentials?: any) {}

  public async endChat(): Promise<void> {}

  public isActive(): boolean { return false; }

  public onChatEstablished(callback: () => void): void {
    this.chatEstablishedCallbacks.push(callback);
  }

  public onChatFailed(callback: (error: Error) => void): void {
    this.chatFailedCallbacks.push(callback);
  }

  public onMessageReceived(callback: (message: any) => void): void {
    this.messageReceivedCallbacks.push(callback);
  }

  public onTypingIndicator(callback: (isTyping: boolean) => void): void {
    this.typingIndicatorCallbacks.push(callback);
  }

  public onChatEnded(callback: () => void): void {
    this.chatEndedCallbacks.push(callback);
  }
}
