const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/**
 * @param {string|null|undefined} ip
 */
export function isValidIpv4(ip) {
  if (ip == null || ip === '') return true;
  return IPV4.test(ip);
}
