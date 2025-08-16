// Vercel function for /api/v2/api/check-usage
module.exports = async function handler(req, res) {
  try {
    const startTime = Math.floor(Date.now() / 1000) - 86400; // Last 24 hours
    
    console.log("[V2] Checking OpenAI API usage...");
    
    const response = await fetch("https://api.openai.com/v1/organization/usage/completions?" + 
      new URLSearchParams({
        start_time: startTime,
        limit: 1,
        bucket_width: "1d"
      }), {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    // Check if it's a permission error (key works but lacks specific permission)
    if (response.status === 401 && data?.error?.message?.includes('api.usage.read')) {
      return res.json({
        apiKeyWorking: true, // Key works, just lacks this specific permission
        statusCode: response.status,
        message: 'API key is valid but lacks usage read permissions',
        tokens: {
          input: 'N/A',
          output: 'N/A',
          cached: 'N/A',
          requests: 'N/A'
        }
      });
    }
    
    const usage = {
      apiKeyWorking: response.ok,
      statusCode: response.status,
      data: data
    };
    
    if (data && data.data && data.data[0] && data.data[0].results && data.data[0].results[0]) {
      const result = data.data[0].results[0];
      usage.tokens = {
        input: result.input_tokens || 0,
        output: result.output_tokens || 0,
        cached: result.input_cached_tokens || 0,
        requests: result.num_model_requests || 0
      };
    }
    
    res.json(usage);
  } catch (error) {
    console.error("[V2] Error checking OpenAI usage:", error);
    res.status(500).json({ 
      error: "Failed to check usage",
      message: error.message,
      apiKeyWorking: false 
    });
  }
}