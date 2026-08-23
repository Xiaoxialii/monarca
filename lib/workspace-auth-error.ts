export class WorkspaceAuthError extends Error {
  status: 401 | 403 | 409;
  code?: string;

  constructor(message: string, status: 401 | 403 | 409, code?: string) {
    super(message);
    this.name = "WorkspaceAuthError";
    this.status = status;
    this.code = code;
  }
}
