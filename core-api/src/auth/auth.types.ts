/** Payload signed into the access token. */
export interface JwtPayload {
  sub: string; // Admin id
  email: string;
}

/** Shape attached to `request.user` after JwtStrategy validation. */
export interface AuthenticatedAdmin {
  id: string;
  email: string;
  fullName: string;
}
