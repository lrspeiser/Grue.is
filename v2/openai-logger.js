// openai-logger.js - Centralized OpenAI API logging wrapper

const OpenAIApi = require("openai");

class OpenAILogger {
  constructor(apiKey) {
    this.client = new OpenAIApi({ apiKey });
    this.requestCount = 0;
    this.totalTokens = { input: 0, output: 0, cached: 0 };
  }

  async loggedRequest(method, params, context = "") {
    this.requestCount++;
    const requestId = `req_${Date.now()}_${this.requestCount}`;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[OpenAI Request #${this.requestCount}] ${requestId}`);
    console.log(`Context: ${context}`);
    console.log(`Method: ${method}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Request Params:`, JSON.stringify(params, null, 2));
    console.log(`${'='.repeat(80)}\n`);
    
    const startTime = Date.now();
    
    try {
      // Make the actual request
      let response;
      if (method === 'responses.create') {
        response = await this.client.responses.create(params);
      } else if (method === 'chat.completions.create') {
        response = await this.client.chat.completions.create(params);
      } else if (method === 'images.generate') {
        response = await this.client.images.generate(params);
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }
      
      const duration = Date.now() - startTime;
      
      // Log response details
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[OpenAI Response #${this.requestCount}] ${requestId}`);
      console.log(`Duration: ${duration}ms`);
      console.log(`Status: SUCCESS`);
      
      // Extract and log token usage
      if (response.usage) {
        console.log(`Token Usage:`);
        console.log(`  - Input tokens: ${response.usage.prompt_tokens || response.usage.input_tokens || 0}`);
        console.log(`  - Output tokens: ${response.usage.completion_tokens || response.usage.output_tokens || 0}`);
        console.log(`  - Total tokens: ${response.usage.total_tokens || 0}`);
        
        // Update totals
        this.totalTokens.input += response.usage.prompt_tokens || response.usage.input_tokens || 0;
        this.totalTokens.output += response.usage.completion_tokens || response.usage.output_tokens || 0;
      }
      
      // Log response content (truncated for readability)
      if (response.choices && response.choices[0]) {
        const choice = response.choices[0];
        if (choice.message) {
          console.log(`Response Type: Chat Message`);
          console.log(`Response Content (first 500 chars):`, 
            JSON.stringify(choice.message).substring(0, 500) + '...');
        } else if (choice.text) {
          console.log(`Response Type: Completion`);
          console.log(`Response Text (first 500 chars):`, 
            choice.text.substring(0, 500) + '...');
        }
        
        // Log tool calls if present
        if (choice.message?.tool_calls) {
          console.log(`Tool Calls:`, JSON.stringify(choice.message.tool_calls, null, 2));
        }
      }
      
      // Log full response for debugging (can be commented out in production)
      if (process.env.VERBOSE_LOGGING === 'true') {
        console.log(`Full Response:`, JSON.stringify(response, null, 2));
      }
      
      console.log(`Running Total Tokens - Input: ${this.totalTokens.input}, Output: ${this.totalTokens.output}`);
      console.log(`${'='.repeat(80)}\n`);
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log error details
      console.error(`\n${'='.repeat(80)}`);
      console.error(`[OpenAI Error #${this.requestCount}] ${requestId}`);
      console.error(`Duration: ${duration}ms`);
      console.error(`Status: ERROR`);
      console.error(`Error Type: ${error.constructor.name}`);
      console.error(`Error Message: ${error.message}`);
      
      if (error.response) {
        console.error(`HTTP Status: ${error.response.status}`);
        console.error(`Error Data:`, JSON.stringify(error.response.data, null, 2));
      }
      
      if (error.stack) {
        console.error(`Stack Trace:`, error.stack);
      }
      
      console.error(`${'='.repeat(80)}\n`);
      
      throw error;
    }
  }
  
  getStats() {
    return {
      requestCount: this.requestCount,
      totalTokens: this.totalTokens
    };
  }
  
  resetStats() {
    this.requestCount = 0;
    this.totalTokens = { input: 0, output: 0, cached: 0 };
  }
}

// Create singleton instance
let instance = null;

function getOpenAILogger() {
  if (!instance) {
    instance = new OpenAILogger(process.env.OPENAI_API_KEY);
  }
  return instance;
}

module.exports = { getOpenAILogger, OpenAILogger };