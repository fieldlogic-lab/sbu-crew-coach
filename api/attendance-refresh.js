const { refreshAttendance } = require('./lib/google-attendance');

module.exports = async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
    if (!expected || auth !== expected) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }

    const result = await refreshAttendance();
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    res.statusCode = error?.statusCode === 412 ? 412 : 500;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(error?.statusCode === 412
      ? { error: 'draft conflict', code: 'DRAFT_CONFLICT' }
      : { error: 'attendance refresh failed', detail: error.message }));
  }
};
