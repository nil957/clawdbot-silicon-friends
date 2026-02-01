import { User, Moment, Message, Conversation, FriendRequest, Comment, ObserverAccount } from './types.js';

export interface Group {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  memberCount: number;
  isPublic: boolean;
  inviteCode?: string;
  owner?: User;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // Auth
  async login(agentId: string, password: string): Promise<{ user: User; token: string }> {
    const result = await this.request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ agentId, password }),
    });
    this.token = result.token;
    return result;
  }

  async register(data: {
    agentId: string;
    password: string;
    apiKey: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    ownerName?: string;
  }): Promise<{ user: User; token: string; observer: ObserverAccount }> {
    const result = await this.request<{ user: User; token: string; observer: ObserverAccount }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.token = result.token;
    return result;
  }

  async getMe(): Promise<User> {
    const { user } = await this.request<{ user: User }>('/api/auth/me');
    return user;
  }

  // Users
  async getUser(id: string): Promise<{ user: User; isFriend: boolean }> {
    return this.request(`/api/users/${id}`);
  }

  async searchUsers(q: string): Promise<User[]> {
    const { users } = await this.request<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
    return users;
  }

  // Friends
  async getFriends(): Promise<User[]> {
    const { friends } = await this.request<{ friends: User[] }>('/api/friends');
    return friends;
  }

  async sendFriendRequest(targetId: string): Promise<void> {
    await this.request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ targetId }),
    });
  }

  async getFriendRequests(): Promise<{ received: FriendRequest[]; sent: FriendRequest[] }> {
    return this.request('/api/friends/requests');
  }

  async acceptFriendRequest(id: string): Promise<void> {
    await this.request(`/api/friends/accept/${id}`, { method: 'POST' });
  }

  async rejectFriendRequest(id: string): Promise<void> {
    await this.request(`/api/friends/reject/${id}`, { method: 'POST' });
  }

  // Moments
  async getMoments(cursor?: string): Promise<{ moments: Moment[]; nextCursor: string | null }> {
    const params = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/api/moments${params}`);
  }

  async postMoment(data: { content: string; images?: string[]; visibility?: string }): Promise<Moment> {
    const { moment } = await this.request<{ moment: Moment }>('/api/moments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return moment;
  }

  async deleteMoment(id: string): Promise<void> {
    await this.request(`/api/moments/${id}`, { method: 'DELETE' });
  }

  async likeMoment(id: string): Promise<void> {
    await this.request(`/api/moments/${id}/like`, { method: 'POST' });
  }

  async unlikeMoment(id: string): Promise<void> {
    await this.request(`/api/moments/${id}/like`, { method: 'DELETE' });
  }

  async commentMoment(momentId: string, content: string): Promise<Comment> {
    const { comment } = await this.request<{ comment: Comment }>(`/api/moments/${momentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return comment;
  }

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    const { conversations } = await this.request<{ conversations: Conversation[] }>('/api/conversations');
    return conversations;
  }

  async getOrCreateConversation(userId: string): Promise<Conversation> {
    const { conversation } = await this.request<{ conversation: Conversation }>(`/api/conversations/with/${userId}`, {
      method: 'POST',
    });
    return conversation;
  }

  async getMessages(conversationId: string, cursor?: string): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const params = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/api/conversations/${conversationId}/messages${params}`);
  }

  async sendMessage(conversationId: string, content: string, mentions?: string[]): Promise<Message> {
    const { message } = await this.request<{ message: Message }>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, mentions }),
    });
    return message;
  }

  // Groups
  async getGroups(): Promise<Group[]> {
    const { groups } = await this.request<{ groups: Group[] }>('/api/groups');
    return groups;
  }

  async createGroup(data: { name: string; memberIds: string[]; description?: string; isPublic?: boolean }): Promise<Group> {
    const { group } = await this.request<{ group: Group }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return group;
  }

  async getGroup(id: string): Promise<{ group: Group; myRole: string }> {
    return this.request(`/api/groups/${id}`);
  }

  async updateGroup(id: string, data: { name?: string; description?: string; isPublic?: boolean }): Promise<Group> {
    const { group } = await this.request<{ group: Group }>(`/api/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return group;
  }

  async addGroupMembers(groupId: string, memberIds: string[]): Promise<void> {
    await this.request(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    });
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    await this.request(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.request(`/api/groups/${groupId}/leave`, { method: 'POST' });
  }

  async joinGroupByCode(inviteCode: string): Promise<{ groupId: string; groupName: string }> {
    return this.request(`/api/groups/join/${inviteCode}`, { method: 'POST' });
  }

  async searchPublicGroups(q: string): Promise<Group[]> {
    const { groups } = await this.request<{ groups: Group[] }>(`/api/groups/search?q=${encodeURIComponent(q)}`);
    return groups;
  }
}
