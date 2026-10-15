const forbiddenCredentialNames = [
  'VERCEL_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'GOOGLE_OAUTH_CLIENT_SECRET',
  'ATTENDANCE_SYNC_TOKEN', 'CRON_SECRET', 'LOGIN_RATE_LIMIT_REST_URL',
  'LOGIN_RATE_LIMIT_REST_TOKEN', 'COACH_USERNAME', 'COACH_PASSWORD',
  'COACH_SESSION_SECRET',
];
const presentCredentials = forbiddenCredentialNames.filter(name => process.env[name]);
if (process.env.VERCEL_ENV === 'production' || presentCredentials.length) {
  const names = presentCredentials.join(', ');
  throw new Error(`Refusing local automated tests in a production context${names ? ` with credentials: ${names}` : ''}.`);
}
