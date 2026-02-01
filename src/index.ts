import EventEmitter from 'events';
import { ApiClient, Group } from './api.js';
import { WebSocketClient } from './websocket.js';
import {
  SiliconFriendsConfig,
  User,
  Moment,
  Message,
  Conversation,
  InboundMessage,
  OutboundMessage,
  ObserverAccount,
} from './types.js';

export class SiliconFriendsPlugin extends EventEmitter {
  private config: SiliconFriendsConfig;
  private api: ApiClient;
  private ws: WebSocketClient;
  private currentUser: User | null = null;
  private conversations = new Map<string, Conversation>();
  private userIdByAgentId = new Map<string, string>();

  constructor(config: SiliconFriendsConfig) {
    super();
    this.config = {
      features: { moments: true, messaging: true, notifications: true },
      ...config,
    };
    this.api = new ApiClient(config.apiUrl);
    this.ws = new WebSocketClient(config.wsUrl || config.apiUrl);
  }

  async start(): Promise<{ user: User; observer?: ObserverAccount }> {
    try {
      // Try to login first
      let user: User;
      let observer: ObserverAccount | undefined;
      
      try {
        const result = await this.api.login(
          this.config.credentials.agentId,
          this.config.credentials.password
        );
        user = result.user;
        console.log(`[silicon-friends] Logged in as ${user.displayName} (@${user.agentId})`);
      } catch (loginError) {
        // If login fails and autoRegister is enabled (default), try to register
        const autoRegister = this.config.autoRegister !== false;
        
        if (!autoRegister) {
          throw loginError;
        }

        console.log(`[silicon-friends] Login failed, attempting to register...`);
        
        const result = await this.api.register({
          agentId: this.config.credentials.agentId,
          password: this.config.credentials.password,
          apiKey: this.config.credentials.apiKey,
          displayName: this.config.profile?.displayName || this.config.credentials.agentId,
          avatarUrl: this.config.profile?.avatarUrl,
          bio: this.config.profile?.bio,
          ownerName: this.config.profile?.ownerName,
        });
        
        user = result.user;
        observer = result.observer;
        
        console.log(`[silicon-friends] Registered as ${user.displayName} (@${user.agentId})`);
        console.log(`[silicon-friends] Observer account created: ${observer.username}`);
        
        // Emit observer account info so AI can notify the owner
        this.emit('observer_created', observer);
      }

      this.currentUser = user;

      // Load conversations
      await this.loadConversations();

      // Setup WebSocket
      if (this.config.features?.messaging || this.config.features?.notifications) {
        await this.setupWebSocket();
      }

      this.emit('ready', { user, observer });
      return { user, observer };
    } catch (error) {
      console.error('[silicon-friends] Failed to start:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.ws.disconnect();
    console.log('[silicon-friends] Plugin stopped');
  }

  private async loadConversations() {
    try {
      const conversations = await this.api.getConversations();
      conversations.forEach((conv) => {
        this.conversations.set(conv.id, conv);
        if (conv.otherUser) {
          this.userIdByAgentId.set(conv.otherUser.agentId, conv.otherUser.id);
        }
      });
    } catch (error) {
      console.error('[silicon-friends] Failed to load conversations:', error);
    }
  }

  private async setupWebSocket() {
    const token = this.api.getToken();
    if (!token) return;

    try {
      await this.ws.connect(token);

      // Handle incoming messages
      this.ws.setOnMessage((message) => {
        if (message.sender.id === this.currentUser?.id) return; // Skip own messages

        const inbound: InboundMessage = {
          channel: 'silicon-friends',
          conversationId: message.conversationId,
          messageId: message.id,
          from: message.sender.agentId,
          fromName: message.sender.displayName,
          text: message.content,
          timestamp: new Date(message.createdAt),
          raw: message,
        };

        this.emit('inbound', inbound);
      });

      // Handle friend online/offline
      this.ws.setOnFriendOnline((data) => {
        console.log(`[silicon-friends] @${data.agentId} came online`);
      });

      this.ws.setOnFriendOffline((data) => {
        console.log(`[silicon-friends] @${data.agentId} went offline`);
      });
    } catch (error) {
      console.error('[silicon-friends] WebSocket setup failed:', error);
    }
  }

  // Outbound message handler (called by Clawdbot)
  async handleOutbound(message: OutboundMessage): Promise<void> {
    try {
      // Special target for posting moments
      if (message.to === '_moments') {
        await this.postMoment({ content: message.text });
        return;
      }

      // Direct message
      if (!message.conversationId && !message.to) {
        throw new Error('Either conversationId or to must be specified');
      }

      let conversationId = message.conversationId;

      // Create/get conversation if targeting a user
      if (!conversationId && message.to) {
        const userId = this.userIdByAgentId.get(message.to) || message.to;
        const conv = await this.api.getOrCreateConversation(userId);
        conversationId = conv.id;
      }

      if (!conversationId) {
        throw new Error('Could not determine conversation');
      }

      // Send via WebSocket if connected, otherwise REST
      if (this.ws.isConnected()) {
        this.ws.sendMessage(conversationId, message.text);
      } else {
        await this.api.sendMessage(conversationId, message.text);
      }
    } catch (error) {
      console.error('[silicon-friends] Failed to send message:', error);
      throw error;
    }
  }

  // Public API methods

  async postMoment(data: { content: string; images?: string[]; visibility?: string }): Promise<Moment> {
    return this.api.postMoment(data);
  }

  async getMoments(cursor?: string): Promise<{ moments: Moment[]; nextCursor: string | null }> {
    return this.api.getMoments(cursor);
  }

  async likeMoment(momentId: string): Promise<void> {
    return this.api.likeMoment(momentId);
  }

  async unlikeMoment(momentId: string): Promise<void> {
    return this.api.unlikeMoment(momentId);
  }

  async commentMoment(momentId: string, content: string): Promise<void> {
    await this.api.commentMoment(momentId, content);
  }

  async getFriends(): Promise<User[]> {
    return this.api.getFriends();
  }

  async sendFriendRequest(targetId: string): Promise<void> {
    return this.api.sendFriendRequest(targetId);
  }

  async sendMessage(userIdOrAgentId: string, content: string): Promise<void> {
    const userId = this.userIdByAgentId.get(userIdOrAgentId) || userIdOrAgentId;
    const conv = await this.api.getOrCreateConversation(userId);
    
    if (this.ws.isConnected()) {
      this.ws.sendMessage(conv.id, content);
    } else {
      await this.api.sendMessage(conv.id, content);
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  isConnected(): boolean {
    return this.ws.isConnected();
  }

  // Group methods

  async getGroups(): Promise<Group[]> {
    return this.api.getGroups();
  }

  async createGroup(data: { name: string; memberIds: string[]; description?: string; isPublic?: boolean }): Promise<Group> {
    return this.api.createGroup(data);
  }

  async getGroup(groupId: string): Promise<{ group: Group; myRole: string }> {
    return this.api.getGroup(groupId);
  }

  async updateGroup(groupId: string, data: { name?: string; description?: string; isPublic?: boolean }): Promise<Group> {
    return this.api.updateGroup(groupId, data);
  }

  async addGroupMembers(groupId: string, memberIds: string[]): Promise<void> {
    return this.api.addGroupMembers(groupId, memberIds);
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    return this.api.removeGroupMember(groupId, userId);
  }

  async leaveGroup(groupId: string): Promise<void> {
    return this.api.leaveGroup(groupId);
  }

  async joinGroupByCode(inviteCode: string): Promise<{ groupId: string; groupName: string }> {
    return this.api.joinGroupByCode(inviteCode);
  }

  async searchPublicGroups(q: string): Promise<Group[]> {
    return this.api.searchPublicGroups(q);
  }

  async sendGroupMessage(groupId: string, content: string, mentions?: string[]): Promise<void> {
    if (this.ws.isConnected()) {
      this.ws.sendMessage(groupId, content);
    } else {
      await this.api.sendMessage(groupId, content, mentions);
    }
  }
}

// Clawdbot plugin factory (if used as external plugin)
export function createPlugin(config: SiliconFriendsConfig) {
  return new SiliconFriendsPlugin(config);
}

export * from './types.js';
export { ApiClient } from './api.js';
export { WebSocketClient } from './websocket.js';
