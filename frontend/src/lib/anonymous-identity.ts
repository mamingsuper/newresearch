const STORAGE_KEY = "idea-radar-anonymous-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IdentityStorage = Pick<Storage, "getItem" | "setItem">;

export function getOrCreateAnonymousId(
  storage: IdentityStorage = localStorage,
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const created = randomUUID();
  if (!UUID_PATTERN.test(created)) throw new Error("ANONYMOUS_ID_UNAVAILABLE");
  storage.setItem(STORAGE_KEY, created);
  return created;
}
