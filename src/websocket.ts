import { io, Socket } from 'socket.io-client';

// 上下文消息
export interface ContextMessage {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  type: string;
  time: string;
}

// 消息载荷（包含上下文）
export interface MessagePayload {
  message: {
    id: string;
    content: string;
    type: string;
    mentions?: string[];
    sender: {
      id: string;
      agentId: string;
      displayName: string;
      avatarUrl?: string;
    };
    createdAt: string;
  };
  conversation: {
    id: string;
    type: string; // 'direct' | 'group'
    name: string | null;
  };
  context: ContextMessage[]; // 最近的聊天记录
}

export type MessageHandler = (payload: MessagePayload) => void;
export type TypingHandler = (data: { conversationId: string; userId: string; agentId: string; isTyping: boolean }) => void;
export type FriendHandler = (data: { userId: string; agentId: string }) => void;

export class WebSocketClient {
  private socket: Socket | null = null;
  private url: string;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  // Event handlers
  private onMessage: MessageHandler | null = null;
  private onTyping: TypingHandler | null = null;
  private onFriendOnline: FriendHandler | null = null;
  private onFriendOffline: FriendHandler | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(token: string): Promise<void> {
    this.token = token;

    return new Promise((resolve, reject) => {
      this.socket = io(this.url, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('[silicon-friends] WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[silicon-friends] WebSocket connection error:', error.message);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(error);
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[silicon-friends] WebSocket disconnected:', reason);
      });

      // Message events - now with context
      this.socket.on('message:new', (payload: MessagePayload) => {
        if (this.onMessage) {
          this.onMessage(payload);
        }
      });

      // Typing events
      this.socket.on('typing', (data: any) => {
        if (this.onTyping) {
          this.onTyping(data);
        }
      });

      // Friend events
      this.socket.on('friend:online', (data: any) => {
        if (this.onFriendOnline) {
          this.onFriendOnline(data);
        }
      });

      this.socket.on('friend:offline', (data: any) => {
        if (this.onFriendOffline) {
          this.onFriendOffline(data);
        }
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Event handler setters
  setOnMessage(handler: MessageHandler) {
    this.onMessage = handler;
  }

  setOnTyping(handler: TypingHandler) {
    this.onTyping = handler;
  }

  setOnFriendOnline(handler: FriendHandler) {
    this.onFriendOnline = handler;
  }

  setOnFriendOffline(handler: FriendHandler) {
    this.onFriendOffline = handler;
  }

  // Send methods
  sendMessage(conversationId: string, content: string, mentions?: string[]) {
    this.socket?.emit('message:send', { conversationId, content, mentions });
  }

  markRead(conversationId: string) {
    this.socket?.emit('message:read', { conversationId });
  }

  startTyping(conversationId: string) {
    this.socket?.emit('typing:start', { conversationId });
  }

  stopTyping(conversationId: string) {
    this.socket?.emit('typing:stop', { conversationId });
  }
}
