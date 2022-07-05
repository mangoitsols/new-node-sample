import {Request, RequestHandler} from "express";
import {GetTokenCallback, IsRevokedCallback} from "express-jwt";
import {ApiKey} from '../models/api-key';
import expressJwt = require("express-jwt");

class TokenRevokedError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
  }
}

const EXCLUDED_PATHS = [
  /\/authenticate\/?$/i,
  /\/register\/?$/i,
  /\/register\/?(.+)?$/i,
  /\/change-password\/?$/i,
  /\/subscription\/webhook$/i,
  /\/subscription\/stripeInfo$/i,
  /\/admin\/login/i,
  /\/admin\/invite/i,
  /\/admin\/reset/i,
  /\/subscription\/coupons/i,
  /\/subscription\/list-plans/i,
  /\/spec/,
  /\/_health-check/
];

export interface Payload {
  /**
   * user ID
   */
  sub?: string;
  /**
   * API key ID
   */
  sn?: string;
  /**
   * timestamp of issue date
   */
  iat?: string;
  /**
   * timestamp of expiration
   */
  exp?: string
  /**
   * Permission array
   * If not included, assume all permissions granted
   *  Todo: reverse this model once old tokens are cycled out: fail if permissions are missing
   */
  perms?: string[];
}

const parseToken: GetTokenCallback = function (req: Request) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
      return req.headers.authorization.split(' ')[1];
    }
    if(req.cookies && req.cookies.auth) {
      return req.cookies.auth;
    }
    if (req.query && req.query.token) {
      return req.query.token;
    }
    return null;
};

async function touchApiKeyTimestamp(apiKey) {
  try {
    apiKey.last_used = Date.now();
    await apiKey.save();
  } catch (err) {
    console.log('Error updating apikey timestamp', err);
  }
}

const checkRevocation: IsRevokedCallback = async function (req: Request, payload: Payload, done: (err:any, revoked?: boolean) => void) {
  const tokenId = payload.sn;
  let error = null;
  let revoked = false;
  let apiKey = null;
  if (tokenId) {
    apiKey = await ApiKey.findById(tokenId).exec();
    revoked = !apiKey;
    error = revoked ? new TokenRevokedError('Token is not valid'): null;
  }
  if (apiKey) {
    // await ignored since this is a background operation
    touchApiKeyTimestamp(apiKey);
  }
  done(error, revoked);
};

export function jwtAuthentication(): RequestHandler {
  return expressJwt({
    secret: process.env.SESSION_SECRET,
    getToken: parseToken,
    isRevoked: checkRevocation
  }).unless({
    path: EXCLUDED_PATHS
  });
}
