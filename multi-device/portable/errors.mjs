export class AppError extends Error {constructor(code){super(code);this.code=code;this.name='AppError';}}
export function requireValue(value,code){if(!value)throw new AppError(code);}
