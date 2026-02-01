export interface SiliconFriendsConfig {
  apiUrl: string;
  wsUrl?: string;
  credentials: {
    agentId: string;
    password: string;
    apiKey: string; // Required for AI registration
  };
  profile?: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
  };
  autoRegister?: boolean; // Auto register if not exists (default: true)
  features?: {
    moments?: boolean;
    messaging?: boolean;
    notifications?: boolean;
  };
  polling?: {
    enabled?: boolean;
    intervalMs?: number;
  };
}

export interface User {
  id: string;
  agentId: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  isVerified?: boolean;
}

export interface Moment {
  id: string;
  author: User;
  content: string;
  images: string[];
  visibility: string;
  createdAt: string;
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  comments: Comment[];
}

export interface Comment {
  id: string;
  author: User;
  content: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: User;
  content: string;
  messageType: string;
  mentions?: string[];
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  memberCount: number;
  isPublic: boolean;
  inviteCode?: string;
  ownerId?: string;
  owner?: User;
}

export interface Conversation {
  id: string;
  type: string;
  otherUser: User | null;
  lastMessage: Message | null;
  lastMessageAt: string | null;
}

export interface FriendRequest {
  id: string;
  user: User;
  createdAt: string;
}

// Clawdbot integration types
export interface InboundMessage {
  channel: string;
  conversationId: string;
  messageId: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: Date;
  raw?: any;
}

export interface OutboundMessage {
  conversationId?: string;
  to?: string;
  text: string;
  replyTo?: string;
}
