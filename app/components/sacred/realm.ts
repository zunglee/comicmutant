/** Sacred India is every path under /sacred; the whole site template changes there. */
export const isSacredPath = (pathname: string) =>
  pathname === '/sacred' || pathname.startsWith('/sacred/');
