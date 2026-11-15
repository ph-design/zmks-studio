import { Reader } from "protobufjs/minimal";

export function fields(bytes: Uint8Array) {
  const reader = Reader.create(bytes),
    found = new Map<number, number | Uint8Array>();
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag & 7) === 0) found.set(tag >>> 3, reader.uint32());
    else if ((tag & 7) === 2) found.set(tag >>> 3, reader.bytes());
    else reader.skipType(tag & 7);
  }
  return found;
}

export function nested(bytes: Uint8Array, path: number[]): Uint8Array | undefined {
  let current: Uint8Array | undefined = bytes;
  for (const field of path) {
    const value = fields(current).get(field);
    if (!(value instanceof Uint8Array)) return undefined;
    current = value;
  }
  return current;
}
