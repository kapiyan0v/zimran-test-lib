export class ABTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ABTestError';
  }
}