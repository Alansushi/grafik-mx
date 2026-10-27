import { isEmail } from './validation.js';

export const captureEnabled = () => process.env.QUOTE_CAPTURE_ENABLED === '1' &&
  Boolean(process.env.PRIVACY_CONTROLLER?.trim() && process.env.PRIVACY_ADDRESS?.trim() &&
    isEmail(process.env.PRIVACY_EMAIL?.trim()));
