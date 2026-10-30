/** Motion's animation features, split out so the first paint ships without them (see root.tsx). */
// domAnimation: no layout/drag animations are used, so the smaller feature set is enough.
import { domAnimation } from 'motion/react';

export default domAnimation;
