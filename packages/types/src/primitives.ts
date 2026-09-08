export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AssetCode = string;
export type CountryCode = string;
export type IsoTimestamp = string;
export type RequestId = string;
export type Uuid = string;
