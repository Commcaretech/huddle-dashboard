export class SourceError extends Error {
  constructor(code,message) { super(message); this.code=code; }
}
