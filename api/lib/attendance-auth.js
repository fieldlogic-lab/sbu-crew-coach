function authorizedAttendanceRequest(req, token = process.env.ATTENDANCE_SYNC_TOKEN) {
  return Boolean(token && req?.headers?.['x-attendance-sync-token'] === token);
}

module.exports = { authorizedAttendanceRequest };
