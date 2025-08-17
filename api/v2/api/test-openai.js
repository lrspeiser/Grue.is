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
    
    // Try a simple completion
    console.log('[Test] Attempting OpenAI API call...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use mini model for testing
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say 'API is working!' in 3 words exactly." }
      ],
      max_tokens: 10
    });
    
    const response = completion.choices[0].message.content;
    console.log('[Test] OpenAI responded:', response);
    
    return res.json({
      success: true,
      keyExists: true,
      keyLength: apiKey.length,
      keyPrefix: apiKey.substring(0, 7) + '...',
      apiResponse: response,
      model: completion.model,
      usage: completion.usage
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