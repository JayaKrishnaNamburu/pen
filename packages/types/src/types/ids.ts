export type BlockId = string & { readonly __brand: "BlockId" };
export type AppId = string & { readonly __brand: "AppId" };
export type ZoneId = string & { readonly __brand: "ZoneId" };
export type DocId = string & { readonly __brand: "DocId" };

export function blockId(raw: string): BlockId {
  return raw as BlockId;
}
export function appId(raw: string): AppId {
  return raw as AppId;
}
export function zoneId(raw: string): ZoneId {
  return raw as ZoneId;
}
export function docId(raw: string): DocId {
  return raw as DocId;
}
