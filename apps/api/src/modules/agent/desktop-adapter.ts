export type DesktopAction = { type: "open_application"; application: "chrome" | "vscode" };

export type DesktopExecutionStatus =
  "requested" | "attempted" | "succeeded" | "verified" | "failed" | "cancelled";

export interface DesktopExecutionResult {
  status: DesktopExecutionStatus;
  message: string;
}

export interface DesktopAgentAdapter {
  authorize(userId: string, action: DesktopAction): Promise<boolean>;
  execute(
    userId: string,
    action: DesktopAction,
    signal: AbortSignal,
  ): Promise<DesktopExecutionResult>;
}
