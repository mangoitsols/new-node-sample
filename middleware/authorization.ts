import guardFactory from 'express-jwt-permissions'
import {RequestHandler} from "express-unless";
import {NextFunction, Request, RequestHandler as expressRequestHandler, Response} from 'express';
import * as _ from 'lodash';


class AuthorizationError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
  }
}
/**
 * Define APIs which are off limits to third party API keys.
 * This will eventually be replaced with a holistic permission model.
 */
const THIRD_PARTY_WHITELIST = ([
  /^\/flights\/?.*/,
  /^\/aircrafts\/?.*/,
  /^\/users\/?.*/,
  /^\/integrations\/[\w\d]+\/webhook\/[\w\d]+/,
    /^\/vendor-authenticate\/?.*/
]);

const guard = guardFactory({
  permissionsProperty: 'perms',
});

export function checkPermission(permissions: string[]) {
  const checker = guard.check(permissions) as RequestHandler;
  return checker.unless({
    custom: function (req: Request): boolean {
      const perms: string[] | undefined =  _.get(req, 'user.perms');
      return typeof perms === 'undefined';
    }
  });
}

export function thirdPartyOffLimits(): expressRequestHandler{
  return (req: Request, res: Response, next: NextFunction): any => {
    const path = req.path;
    const isApiKey = !!_.get(req, 'user.sn');
    if (isApiKey) {
      const canUse = THIRD_PARTY_WHITELIST.some((routeRe) => path.match(routeRe));
      if (!canUse) {
        next(new AuthorizationError("Insufficient permission to use this endpoint."));
        return;
      }
    }

    next();
  }
}
