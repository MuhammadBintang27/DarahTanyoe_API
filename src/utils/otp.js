/**
 * OTP Utility Functions
 * Handles OTP generation and validation
 */

/**
 * Generate a 6-digit OTP code
 * @returns {string} 6-digit OTP code
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Calculate OTP expiry time
 * @param {number} minutes - Minutes until expiry (default: 5)
 * @returns {Date} Expiry date object
 */
export const getOTPExpiry = (minutes = 5) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Check if OTP has expired
 * @param {string|Date} expiryTime - Expiry timestamp
 * @returns {boolean} True if expired
 */
export const isOTPExpired = (expiryTime) => {
  return new Date(expiryTime) < new Date();
};

export default {
  generateOTP,
  getOTPExpiry,
  isOTPExpired
};
