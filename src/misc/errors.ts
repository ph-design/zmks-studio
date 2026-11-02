import type { Translate } from "./format";

export class ConnRpcError extends Error {
  readonly key: string;
  readonly defaultText: string;
  readonly detail?: string;

  constructor(key: string, defaultText: string, detail?: string) {
    super(detail || defaultText);
    this.name = "ConnRpcError";
    this.key = key;
    this.defaultText = defaultText;
    this.detail = detail;
  }
}

// Display string for anything thrown by an action or an RPC helper.
export function errorText(t: Translate, error: unknown): string {
  if (error instanceof ConnRpcError) {
    const head = t(error.key, error.defaultText);
    return error.detail ? `${head}：${error.detail}` : head;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return t("carbon.conn.unknownError", "Unknown error");
}
