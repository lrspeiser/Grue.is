// Direct Vercel API route for /api/v2/api/test
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'V2 API test endpoint (Vercel direct)',
    timestamp: new Date().toISOString()
  });
}