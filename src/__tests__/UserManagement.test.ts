import { describe, it, expect } from 'vitest';
import { UserManager } from '@/core/UserManagement';
import { ABTestError } from '@/core/errors';

describe('UserManager', () => {
  it('setUser stores and getUser retrieves', () => {
    const mgr = new UserManager();
    mgr.setUser({ id: 'u1', email: 'a@b.com' });
    expect(mgr.getUser()).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('throws ABTestError when getUser called before init', () => {
    const mgr = new UserManager();
    expect(() => mgr.getUser()).toThrow(ABTestError);
    expect(() => mgr.getUser()).toThrow('User not initialized');
  });

  it('throws when id is missing', () => {
    const mgr = new UserManager();
    expect(() => mgr.setUser({ id: '' })).toThrow(ABTestError);
    expect(() => mgr.setUser({ id: '' })).toThrow('User id is required');
  });

  it('throws when id is not a string', () => {
    const mgr = new UserManager();
    // @ts-expect-error testing invalid input
    expect(() => mgr.setUser({ id: 123 })).toThrow(ABTestError);
  });

  it('updateUser merges partial data', () => {
    const mgr = new UserManager();
    mgr.setUser({ id: 'u1', email: 'old@test.com' });
    mgr.updateUser({ email: 'new@test.com' });
    expect(mgr.getUser().email).toBe('new@test.com');
    expect(mgr.getUser().id).toBe('u1');
  });

  it('updateUser throws if not initialized', () => {
    const mgr = new UserManager();
    expect(() => mgr.updateUser({ email: 'x' })).toThrow(ABTestError);
  });

  it('isInitialized returns correct state', () => {
    const mgr = new UserManager();
    expect(mgr.isInitialized()).toBe(false);
    mgr.setUser({ id: 'u1' });
    expect(mgr.isInitialized()).toBe(true);
  });

  it('clear resets user', () => {
    const mgr = new UserManager();
    mgr.setUser({ id: 'u1' });
    mgr.clear();
    expect(mgr.isInitialized()).toBe(false);
    expect(() => mgr.getUser()).toThrow(ABTestError);
  });

  it('setUser creates a copy (no mutation)', () => {
    const mgr = new UserManager();
    const original = { id: 'u1', email: 'a@b.com' };
    mgr.setUser(original);
    original.email = 'mutated@b.com';
    expect(mgr.getUser().email).toBe('a@b.com');
  });
});
