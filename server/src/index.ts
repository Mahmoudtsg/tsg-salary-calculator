// ============================================================
// TSG Salary & Cost Calculator - Express Server
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import apiRoutes from './routes/api';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API routes (calculation + FX only — no database dependency)
app.use('/api', apiRoutes);

// Global error handler — must be AFTER routes so it catches errors from routes too
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON in request body.' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
});

// Static file serving and SPA fallback — only when running standalone (not on Vercel)
// On Vercel, static files are served from outputDirectory and only /api/* hits this function
if (!process.env.VERCEL) {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 TSG Calculator API running on http://0.0.0.0:${PORT}`);
    console.log(`📊 API endpoints available at http://0.0.0.0:${PORT}/api`);
    console.log(`❤️  Health check: http://0.0.0.0:${PORT}/api/health`);
  });
}

export default app;
