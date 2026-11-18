export interface JwtPayload {
  sub: string;
  email: string;
  roles: Array<'Admin' | 'Analyst' | 'Viewer'>;
}
