import type { JsonValue, RequestId } from "./primitives";

export interface ApiError {
  code: string;
  message: string;
  user_message: string;
  retryable: boolean;
  context: Record<string, JsonValue>;
  request_id: RequestId;
}

export interface ApiSuccess<T> {
  data: T;
  request_id: RequestId;
}

export interface ApiFailure {
  error: ApiError;
  request_id: RequestId;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface RequestMetadata {
  request_id: RequestId;
  idempotency_key?: string;
}

export interface PaginatedData<T> {
  items: T[];
  next_cursor: string | null;
}
