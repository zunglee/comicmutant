import type { Config } from '@react-router/dev/config';

export default {
  // SSR so case files are indexable and the admin can publish without a rebuild.
  ssr: true,
} satisfies Config;
