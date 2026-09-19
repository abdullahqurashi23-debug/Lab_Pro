// bcryptjs doesn't ship its own TypeScript types and @types/bcryptjs isn't
// installed — this is the entire surface this app actually uses.
declare module 'bcryptjs' {
  export function hashSync(data: string, saltRounds: number): string;
  export function compareSync(data: string, encrypted: string): boolean;
}
