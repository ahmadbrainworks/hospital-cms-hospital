import type { RequestContext } from '@hospital-cms/shared-types';

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

export {};
