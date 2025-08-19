// Test endpoint to verify OpenAI API connection
const OpenAI = require('openai');

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  // Check if API key exists
  if (!apiKey) {
    return res.json({
      success: false,
      error: 'OPENAI_API_KEY environment variable not set',
      keyExists: false
    });
  }
  
  try {
    const openai = new OpenAI({ apiKey });
    
    // Use Responses API for compatibility with gpt-5/gpt-5-nano
    console.log('[Test] Attempting OpenAI Responses API call...');
    const resp = await openai.responses.create({
      model: process.env.PROMPT_MODEL || 'gpt-5-nano',
      input: "Say 'API is working!' in 3 words exactly."
    });

    let text = '';
    if (typeof resp.output_text === 'string' && resp.output_text.trim()) {
      text = resp.output_text.trim();
    } else if (Array.isArray(resp.output)) {
      text = resp.output.flatMap(p => (p.content || []).filter(c => c.type === 'output_text').map(c => c.text)).join('').trim();
    }

    return res.json({
      success: true,
      keyExists: true,
      keyLength: apiKey.length,
      keyPrefix: apiKey.substring(0, 7) + '...',
      apiResponse: text,
      model: resp.model,
      usage: resp.usage
    });
    
  } catch (error) {
    console.error('[Test] OpenAI API Error:', error);
    return res.json({
      success: false,
      keyExists: true,
      keyLength: apiKey.length,
      keyPrefix: apiKey.substring(0, 7) + '...',
      error: error.message,
      errorType: error.type,
      errorCode: error.code,
      errorStatus: error.status
    });
  }
};
