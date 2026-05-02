import { TimestampSession } from "@/types";

const g = globalThis as unknown as { _sessions: Map<string, TimestampSession> };
if (!g._sessions) g._sessions = new Map();

export const store = g._sessions;

export const getAll = (): TimestampSession[] =>
  [...store.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

export const get = (id: string) => store.get(id);
export const save = (s: TimestampSession) => store.set(s.id, s);
export const remove = (id: string) => store.delete(id);
