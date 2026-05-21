import { v4 as uuidv4 } from 'uuid';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const generateIdempotencyKey = () => uuidv4();

export const isValidIdempotencyKey = value =>
  typeof value === 'string' && UUID_V4_PATTERN.test(value);

export const ensureIdempotencyKey = existingKey =>
  isValidIdempotencyKey(existingKey) ? existingKey : generateIdempotencyKey();
