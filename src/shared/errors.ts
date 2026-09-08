export class UserFacingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UserFacingError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof Error && error.name === "PasswordException") {
    return "This PDF is encrypted or password-protected and cannot be opened.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "An unexpected error occurred.";
}
