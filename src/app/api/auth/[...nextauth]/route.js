// Auth.js v5 route: the whole OAuth surface (sign-in, callback, session,
// sign-out) is served by the handlers built in src/auth.js — this file only
// mounts them. Do not add logic here; configuration belongs in src/auth.js.
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
