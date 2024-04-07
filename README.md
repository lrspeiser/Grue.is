```markdown
# Grue

Grue is an homage to the old text-based adventure games like Zork. I wanted to see what would happen if we wired one of those up to a GPT dungeon master. The only issue was, I don't know how to program. I decided to see if I could direct GPT to write it for me. I was very pleased with the outcome. Play it: [http://grue.is](http://grue.is)

## How to Get the Most Out of an LLM as a Non-Programmer

- **Picking Your Environment:**
  - Real programmers might choose an IDE like Visual Studio.
  - I encountered environmental setup problems with these IDEs.
  - Replit provided an incredible, hassle-free experience, handling everything from compilation to database management and web deployment.

- **Choosing Your Language:**
  - Began with Python due to its popularity and documentation.
  - Switched to Rust for its cool factor, but found GPT performed poorly with it.
  - Eventually settled on Node JS for its ease in linking front end and backend, and fewer errors in GPT-generated code.

- **Console.logs, the Eyes of the LLM:**
  - Faced environmental issues in installing log software.
  - Resorted to extensive use of console logs for debugging, adopting a specific format for clarity.

- **Performance and LLMs Not Getting LLMs:**
  - Noticed a gap in LLM's speed compared to local coding.
  - Adopted strategies like pre-computing elements and keeping simple functions local to mitigate this.

- **Database vs. Flat Files:**
  - Explored various databases (SQLLite, Postgres, CockroachDB) and flat files with JSON.
  - Found both approaches doable with LLMs but preferred flat files for their ease of modification in Replit.

- **Prompt Engineering:**
  - Initially struggled with LLM's inability to provide complete code as requested.
  - Developed a more structured approach to prompts to ensure more accurate and useful responses.

- **Comments:**
  - Realized the importance of comments for guiding LLMs and maintaining code integrity, emphasizing the directive to never change certain parts.

- **Why Being a Connoisseur Is Valuable:**
  - Despite not learning to code, understanding how code works allowed for more efficient direction of LLMs.
  - Found it easier to rewrite the entire program from scratch with this understanding, leading to significantly better results.

## Ideal World

- **Seeing All the Code, All the Time:**
  - Hopes for larger context windows and automatic log processing by LLMs to speed up the development process.

- **If LLMs Ever Wire Up to Compilers:**
  - Suggests integrating compilers and environments like Replit directly with LLMs for a more streamlined development process.

- **As Code That Uses LLMs Get Incorporated into LLMs:**
  - Highlights the need for more code examples using LLMs in the models to improve code generation quality.

## Future of Programming

- **Does This Put Programmers Out of a Job?**
  - Argues that the demand for quality software far exceeds the supply of programmers, suggesting that enhancing non-programmer capabilities could benefit society.

- **What Should Your Kids Study?**
  - Advocates for coding education that focuses on higher-level concepts and leveraging automation for productivity, rather than just writing code.

## Why Grue?

- A grue is a fictional, predatory creature that dwells in the dark, first introduced in the Dying Earth series and popularized by Zork. This project is a nod to these origins, blending classic adventure with modern AI.
```
