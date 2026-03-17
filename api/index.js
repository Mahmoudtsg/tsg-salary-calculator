// ============================================================
// Vercel Serverless Function — wraps the Express API
// ============================================================

const { default: app, ensureDb } = require('../server/dist/index');

module.exports = async (req, res) => {
  await ensureDb();
  return app(req, res);
};
