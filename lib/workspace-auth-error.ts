export class WorkspaceAuthError extends Error {
  status: 401 | 403 | 409;

  constructor(message: string, status: 401 | 403 | 409) {
    super(message);
    this.name = "WorkspaceAuthError";
    this.status = status;
  }
}
