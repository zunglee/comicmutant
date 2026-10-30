import { createContext } from 'react';

/** Per-request CSP nonce, provided by entry.server around the router; empty in the browser. */
export const NonceContext = createContext<string | undefined>(undefined);
