// openai-logger.js - Centralized OpenAI API logging wrapper

const OpenAI = require("openai");

class OpenAILogger {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
    this.requestCount = 0;
    this.totalTokens = { input: 0, output: 0, cached: 0 };
    this.timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '90000', 10); // default 90s
    this.logFull = process.env.LOG_OPENAI_FULL === '1' || process.env.VERBOSE_LOGGING === 'true';
  }

  async loggedRequest(method, params, context = "") {
    this.requestCount++;
    const requestId = `req_${Date.now()}_${this.requestCount}`;

    // Ensure we never leak secrets in logs
    const safeParams = JSON.parse(JSON.stringify(params));
    if (safeParams?.messages) {
      // nothing to scrub by default
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[OpenAI Request #${this.requestCount}] ${requestId}`);
    console.log(`Context: ${context}`);
    console.log(`Method: ${method}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Request Params:`);
    console.log(this.logFull ? JSON.stringify(safeParams, null, 2) : JSON.stringify(this._truncateParamsForLog(safeParams), null, 2));
    console.log(`${'='.repeat(80)}\n`);

    const startTime = Date.now();

    try {
      // Timeout guard
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response;
      if (method === 'chat.completions.create') {
        response = await this.client.chat.completions.create({ ...params, signal: controller.signal });
      } else if (method === 'responses.create') {
        response = await this.client.responses.create({ ...params, signal: controller.signal });
      } else if (method === 'images.generate') {
        response = await this.client.images.generate({ ...params, signal: controller.signal });
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      clearTimeout(timer);

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

      // Log response content (optionally full)
      if (response.choices && response.choices[0]) {
        const choice = response.choices[0];
        if (choice.message) {
          console.log(`Response Type: Chat Message`);
          if (this.logFull) {
            console.log(`Response Message:`, JSON.stringify(choice.message, null, 2));
          } else {
            console.log(`Response Content (first 1000 chars):`, JSON.stringify(choice.message).substring(0, 1000) + '...');
          }
        } else if (choice.text) {
          console.log(`Response Type: Completion`);
          if (this.logFull) {
            console.log(`Response Text:`, choice.text);
          } else {
            console.log(`Response Text (first 1000 chars):`, choice.text.substring(0, 1000) + '...');
          }
        }

        // Log tool calls if present
        if (choice.message?.tool_calls) {
          const toolCalls = choice.message.tool_calls.map(tc => ({
            ...tc,
            function: {
              name: tc.function?.name,
              // show full arguments if full logging, else truncate
              arguments: this.logFull ? tc.function?.arguments : (tc.function?.arguments?.substring(0, 2000) + (tc.function?.arguments?.length > 2000 ? '...<truncated>' : ''))
            }
          }));
          console.log(`Tool Calls:`, JSON.stringify(toolCalls, null, 2));
        }
      }

      // Log full response for debugging if requested
      if (this.logFull) {
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

  _truncateParamsForLog(params) {
    const clone = JSON.parse(JSON.stringify(params || {}));
    if (Array.isArray(clone.messages)) {
      clone.messages = clone.messages.map(m => ({
        ...m,
        content: typeof m.content === 'string' ? (m.content.length > 1000 ? m.content.slice(0, 1000) + '...<truncated>' : m.content) : m.content
      }));
    }
    if (Array.isArray(clone.tools)) {
      // tools schema can be large; leave as-is
    }
    return clone;
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
