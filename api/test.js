// Direct Vercel API route - bypasses Express
export default function handler(req, res) {
  res.status(200).json({
    message: 'Direct Vercel API route works!',
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
}