import { UserData } from '../types';
import { ABTestError } from './errors';

export class UserManager {
  private currentUser: UserData | null = null;

  getUser(): UserData {
    if (!this.currentUser) {
      throw new ABTestError('User not initialized. Call initializeUser() first.');
    }
    return this.currentUser;
  }

  setUser(data: UserData): void {
    if (!data.id || typeof data.id !== 'string') {
      throw new ABTestError('User id is required and must be a string.');
    }
    this.currentUser = { ...data };
  }

  updateUser(partial: Partial<UserData>): void {
    const current = this.getUser();
    this.currentUser = { ...current, ...partial };
  }

  isInitialized(): boolean {
    return this.currentUser !== null;
  }

  clear(): void {
    this.currentUser = null;
  }
} 