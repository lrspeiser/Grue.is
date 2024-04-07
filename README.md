# Grue

Grue is an homage to the old text-based adventure games like Zork. I wanted to see what would happen if we wired one of those up to a GPT dungeon master. The only issue was, I don't know how to program. I decided to see if I could direct GPT to write it for me. I was very pleased with the outcome. Play it at [http://grue.is](http://grue.is).

## How to get the most out of an LLM as a non-programmer

- **Picking your environment:** A real programmer would have chosen an IDE like Visual Studio for their desktop. I tried a few of these and ran into environmental setup problems too often. I attempted to ask the LLM to explain how to fix them, but they gave instructions that I often failed to understand or did not match the interface I looked at. This would not be a problem for a real programmer, but I wanted results immediately. This is where Replit really shines. I want to compliment this team for building such an incredible experience. I'd seen my kids use this when learning programming, and now I understood why. I didn't have to NPM this or that in the shell. I just started using a function and it took care of everything. I wanted to compile and run my code, no issues. Need a database, done. Want to deploy to the web, easy. This allowed me to focus the LLM on only one thing, code. However, this did impact some decisions later.

- **Choosing your language:** I started by building a simple program that was only accessible via the console log. I chose Python based on its popularity as the example code used for API docs. Generally, it worked well and if I were a programmer I might have stayed with it. However, I ran into one issue that was a non-starter for a non-programmer. Python's insistence on proper formatting. LLMs would often give me a chunk of code to replace. When I would paste it in, I would mess up the tabs. I started to refine my prompts to fix this, but I was impatient. That's why I never became a computer programmer, I'm too impatient to learn the right way. I cut corners. That's why I start companies, to get out of hard work :). So getting the formatting to work was too much effort. Friends told me that modern IDEs would have solved this for me, but per my first point about environments, I was not willing to trade. Because I wasn't doing the code, what did I care which language I chose. So I chose another language. I heard amazing things about Rust. I don't think my program necessarily needed it, but I'd get some cool points for it, so I rewrote it in Rust. I mean, my LLM rewrote it. However, I found that the LLM did a lot worse coding in Rust. I tried a few other formats. I heard good things about Next.JS and Vercel, so I switched to that and set up auto deployment. Very cool, but later when I started testing databases I again ran into issues with deployments. I tried Go and a few other languages. Eventually, I settled on Node JS. I found that for some reason, choosing Node also made passing data between the front end and backend much easier than I found with Python. I'm sure an experienced programmer would have figured out what was wrong with my sockets or whatnot, but this is where another LLM issue cropped up. LLMs tend to make the same mistakes over and over, and for some reason, maybe there aren't enough examples of people building web apps with Python, I don't know, but I was spending days copying and pasting code from the LLM and having it not work. Node, perhaps because of its web roots, was something LLMs made fewer mistakes on.

- **Console.logs, the eyes of the LLM:** I attempted to install log software into my code, but again the environmental issues were often beyond my patience to figure out and I couldn't just paste in what the LLM gave me. So I found myself putting in console logs. A LOT OF CONSOLE LOGS. And I started giving it a format. console.log("[index.js/createuser] Created user:", userid); By giving it the file name, function name, and as often as possible any dynamic data, the LLM could see what went wrong. It created really long console logs, which in itself is a problem with what LLMs can handle today, and I'm sure there are performance issues with it, but it is totally worth it. At one point I created a flag that allowed me to turn the logs on and off but eventually I skipped it because I always wanted the logs on. Perhaps as we move into product, costs, and performance I'll have GPT put it back in again. That said I had to tell LLMs to do this for me very explicitly because it is not a normal pattern.

- **Performance and LLMs not getting LLMs:** In my ideal world I would pipe every action into an LLM to take care of for me. However, I noticed almost immediately that its speed could not compare to a local coding operation. If I wanted to craft a detailed world in advance, the user would be waiting a long time until it was all generated. This might go away in the future, machines are getting faster, but then again like video games and graphic cards, we often fill the available processing up with more complex things to process. So I started to look at two concepts. Run as much as you can before the user engages you and store it. Second, keep simple functions where you can be exact in your matches local. LLM functions are the lifeblood of this. By getting back JSON fields with strict details like Boolean, Integers, or Text chosen from a list, I could run functions quickly and more cheaply. Ok, real programmer, yes this is basic. But here is where I would run into the problem. LLMs are actually really bad at figuring out how LLM functions are part of the code. Now this will go away when there are a billion lines of code that use LLMs, but there are not right now. There are so little that LLMs are super bad at helping with this. Not only that, it's like it treats LLM prompts like wasted space that needs to be rewritten and reduced from 40 lines to 10 words and ... It doesn't understand that the data that comes back is what will power the code. It will try to take your example issue and then hard code if-then statements around the content. More about this in the prompt section.

- **Database vs. Flat Files:** Ok, a little background on why I built this game. I like to build companies, but I don't trust writers to focus on the issues that can kill a company. So I need to personally dive in so I understand the pros/cons/gotchas at a very detailed level. Then I can get out of the water and trust my teams to do what they do best. Because that was my goal, I tested a lot of approaches out that might have been overkill for what I was doing. I tested SQLite, Postgres, serverless databases like CockroachDB. To speed up the system figuring out what the user wanted without waiting for the LLM to round trip I built PGVector databases (which I learned didn't work on CockroachDB). I tested flat files with JSON. I passed data via in-memory databases, worked with cookies and localStorage. I learned about frameworks like Sequelize and started to download SQL navigators to better see the data. I had LLMs build me scripts to preloading the databases or making changes to ones that already had data in them. Here is my summary: It's all doable with LLMs and it's pretty awesome. But as a non-programmer, I'd say it's a bit of a wash. Flat files with JSON were great because you could make changes to the data structure easily without having to learn how to migrate data and you can be sloppy, and in the world of LLMs sloppy is just fine, preferable in many cases. However, there is a lot of setup that is needed with JSON, from creating the files (in my case per user so a sloppy change wouldn't break everyone and the data didn't get so large it would not load), to figuring out how to add, update or remove data from them. I'm sure there is some sort of hybrid out there between the two systems, but for now, I'm sticking with what I can do easily in Replit. Replit does flat files well, and it does Postgres well.

- **Prompt engineering:** I'm ashamed to say that my prompt engineering was so bad at the beginning I got very abusive with my LLM. "NO, I told you to give me the full code! You know I don't know how to code. You've done it three times in a row! Just do what I asked." When the robot uprising comes, you might want to stay clear of me, for your own safety. Let's jump to the punchline. For a non-programmer, I would follow a fairly standard process: 1) I want to add a new field for the user called age. 2) It gives me a little code, maybe referencing a function where it belongs, but without all the code in it. 50% of the time if I tried to add it myself I'd break something. Brackets and try/else statements are the bane of my existence. 2) Great, add your code above into my function. Make sure you remove no content or functions and you don't shorten it. Make sure you add console.logs at every step including dynamic data. Paste: function code or entire file depending on how extensive the changes. 3) Most of the time you get back what you need, you copy and paste it in. Occasionally it adds something that belongs at the top of the page. In time you see the patterns and can do it yourself but at the beginning you can paste the entire file in, although the more code you paste in, the more likely it will summarize something even with your instructions. As your code gets longer, consider refactoring it into multiple files, but understand that this is again where the LLMs get a little confused and expect to spend a lot of time with this exercise. This problem goes away as context windows get larger, so I think this isn't too worrisome.

- **Comments:** Comments are meant for the next programmer, but in my case, I don't have any human programmers. However, I have noticed that the LLMs can break the code in the exact same way over and over again. For instance, if they only know of an old OpenAI model, they will swap the one I wanted for an old one. They will do this while you are trying to change something else and you might not realize that. Some of their changes will fundamentally break something, but then when you paste the logs into it the prescribed fix will be in another area. Before you know it you've destroyed your code with changes and you can't remember how much to undo to find that little change the LLM snuck it. So here is where comments matter. // DO NOT CHANGE THIS, EVER

- **Why being a connoisseur is valuable:** You can become knowledgeable about many products without knowing how to make them. You can describe the benefits of house construction materials, styles and the difficulty of working with them, without knowing how to lay concrete or the order to assemble a house. My experience here is that while I did not learn how to code, I did take the time to learn what the code assembles into. Understanding that allowed me to direct the LLM much more efficiently. My first version of Grue took months and I never really got it to work the way I wanted. I took a break and built a hands-free trivia game in two weeks, then I came back and in two weeks rebuilt my entire game and felt the results were vastly better. Instead of trying to refactor my first program, I found it much easier to just rewrite the entire program given that I knew all the pieces I needed. I did go back to my old software to grab sections where I processed the LLM function calls, but again that was due to the lack of existing examples of code that did that, and I had already worked through those issues with my previous software and could use it as a component of sorts.

## Ideal World

- **Seeing all the code, all the time:** If our context windows get really large, and if we can automatically grab the logs as we run the code and have the LLMs process them, this entire experience will go 10x faster. I spent a lot of time copying and pasting and then focusing its suggested changes into parts of my code. As a stopgap I tried to create readme files from every part of the code and databases via the LLM summarizing the data structures and core functions and pasting that in first. That was critical at the beginning of this process but already both OpenAI and Anthropic have really gone far on their windows and intelligence, so I have stopped building these cheat sheets to kick off each new session.

- **If LLMs ever wire up to compilers:** I would suggest LLMs go a step further and integrate compilers and entire environments like Replit directly into their experiences (hint to Anthropic and OpenAI, acquire Replit if they will have it). I don't think it's a big step to have me ask it to make a change, then have it make the change, run the code, get the logs, and iterate until we get what we want. That is an oversimplification, but not by much. I also think such an approach will work much better than OpenAI's attempts to use assistants and files. I actually love the assistants concept of having multiple systems share in the same pool of information but with different objectives, but the file reading function never worked properly. I think any LLM player can go two directions and it is worth doing both rather than trying to consolidate them into one. First building out a RAG document repository hosted environment. Second building out a code repository wired up to compilers that handle all of the environmental issues and make anyone who has an API enable a one-click auth to enable it to pull from it (not like the current plugins, straight up access to the API calls, like allow me to access my Google Sheet and read/write to it with nothing more than a sign-in).

- **As code that uses LLMs get incorporated into LLMs:** This is more short term, but there is an irony that there isn't enough existing code in the models today to know how to effectively code with LLMs. It will get there of course, but I would make this a priority for any LLM as it will accelerate the very proliferation of that code. Even if they just paid high schoolers to write hundreds of cool games and dumped their code into the engine, it would be well worth it.

## Future of programming

- **Does this put programmers out of a job?** Let's take emotion out of this question first. Given the basic supply and demand curve, the world is filled with absolutely crappy software and user experiences. You could train 100x the programmers out there and we still wouldn't make a dent in it. I think the issue is more than just are there enough programmers. I think the question is whether the cost of making those changes is supported by the revenue they generate. It reminds me a bit of the buildings in Madrid. They went through a massive boom of construction in the '60s. Unfortunately, the '60s were a decade of experimenting with cheap materials that now look super ugly. Do they keep people dry and protected? Yes. Are they ugly? Yes. If we change the economics of beautiful, high-quality user experiences by allowing one person to generate 10x the value, I can only see this as a net positive for society and I believe a quarter of the world could one day be employed building online experiences.

- **What should your kids study?** Yeah, coding used to be the safe backup. Should your kids learn to code now? Absolutely. As I mentioned, having a strong understanding of how programs should work is critical to being successful with this technology. What needs to change, and I fear teachers will struggle with this, is the content of teaching computer programming. Instead of teaching the student exactly what line of code does what, we should treat those as spelling and grammar. We need to understand it and recognize it, but we don't actually need to generate it anymore. Like a form of Maslow's hierarchy, allow the student to focus on the higher levels of the value the code can bring, and use the automation to 10x their productivity and quality of output.

## Why Grue?

A grue is a fictional, predatory creature that dwells in the dark. The term was first used to identify a human-bat hybrid predator in the Dying Earth series. The term was then borrowed to introduce a similar monster in Zork, a 1977 interactive fiction computer game published by Infocom.
