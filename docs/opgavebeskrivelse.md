# Opgavebeskrivelse – RAG-projekt (AI-agenter og automatisering, E2026)

*Kopieret fra ItsLearning.*

Two-week project
RAG Project

A vector database finds what’s similar. A graph database knows what’s connected. Most real problems need both. Your task: pick a domain you care about, feed it into both databases, and build an agent that uses them together. The result is a retrieval system that’s more than the sum of its parts.

Project Goals

Through this project you will gain hands-on experience with:

Setting up and populating a vector database and a graph database.
Understanding when to use semantic search vs. graph traversal — and combining both.
Building data ingestion pipelines in n8n.
Building an AI agent that uses multiple knowledge sources as tools.
Requirements

Choose a domain/case — pick something where both structured relationships (graph) and semantic similarity (vector) are useful
Set up a vector database (Neo4j)
Set up a graph database (Neo4j)
Build a workflow that ingests data into both databases
Build an AI agent that uses both databases as tools to answer questions
Examples of good cases:

Domain	Graph (relationships)	Vector (semantic search)
YouTube channel	Videos → topics, series, tags, related videos	Find videos similar to this one by content
Games	Games → genre, franchise, developer, platform	Find games that feel like “Dark Souls but more relaxed”
Recipes	Recipes → ingredients, cuisine, technique, dietary tags	Find something “creamy and quick”
Movies	Movies → director, actors, franchise, sequels	Find films with a similar vibe to this one
Research papers	Papers → authors, citations, topics	Find papers on similar themes
Music	Songs → artist, album, genre, collaborations	Find songs with a similar feel
Course material	Topics → lectures, articles, videos, concepts	Find content that explains this concept differently
A good case has both: some explicit structure you want to traverse (graph) and rich text/descriptions where meaning matters more than keywords (vector).

Think about what role your agent should play — an expert you can query, a tutor that guides you, a recommendation engine, a research assistant. The role shapes your prompt and what “a good answer” looks like.

Base Solution

Vector RAG
Set up a vector database for text and vectors. Use Neo4j.
Use Ollama (local) or an OpenAI embedding model
Find a way to “chunk” your content - number of chars per chunk or does it have a useful structure already (e.g. text sections)
Create a workflow that populate the vector db with your text i.e. embeds the text and add to Neo4j
Consider adding meta data/attributes such as document where it is from
Automate the embedding with a n8n workflow inc. reading documents
You might want to check for duplicates (and even wipe the db if you restart your embedding)
Graph RAG
Use Neo4j for the graph DB - same DB as the vector DB
Use AI to suggest node and relationship types
You have to make sure the nodes and relationships make sense for your case (normalise them)
Have an AI make cypher so you can import data to the DB - make it part of your workflow if possible - or use a cli like Claude code, codex, Gemini CLI or Mistral Vibe to do it
Make an n8n workflow that automate the import of the data to the DB
AI Agents
Create an agent using n8n’s Agents builder. Give it a model, role, instructions, and guardrails. Connect vector and graph retrieval from Neo4j through workflow tools. Submit the retrieval workflows and document the agent’s configuration.

Describe what each retrieval tool does, which input it expects, and when the agent should use it. Return the retrieved text or graph facts together with their sources.

Write the agent’s prompt/instructions for a specific role (expert in your area, tutor, or whatever makes sense), including what it should do and its guardrails. If you use skills, put task-specific instructions there and explain which retrieval tools they use.

The Agents builder requires a version that supports it (self-hosted n8n 2.32.3 or later). See n8n’s Agents documentation. The Knowledge tab is not a replacement for the project’s Neo4j vector and graph retrieval.

Extra
Add additional/new text/documents automatically to the DBs
Human in the loop — give the AI feedback to improve answers
Multi-agents — introduce an extra AI Agent that can evaluate the RAG Agent’s answers/output and give it feedback, preferably based on RAG information
Add references (agent shows which nodes/documents it used)
Chat interface (n8n’s built-in)
Hybrid search — combine vector + graph results in a single query rather than separately
Q&A

Wednesday 28th of october 9.00-11.00 both in class and Teams. I will provide link on ItsLearning.
Submission

Deadline: Tuesday 3 November at 23:59.

Submit through the assignment on ItsLearning. You can either provide a GitHub repository URL or upload all files directly to ItsLearning. If you use GitHub, make sure I can access the repository.

Your submission must contain:

README: briefly describe your case and the agent’s role. Explain how the components connect and where to find the files below. An architecture diagram is optional.
Workflow screenshots: include a readable overview of each workflow, labelled by purpose—for example, data ingestion, vector retrieval, or graph retrieval.
Workflow JSON: export and include your n8n workflows.
Agent configuration and prompts: provide the model name, agent instructions, tool descriptions, and any skill instructions as text files. Include screenshots showing the agent’s tool connections and examples of prompts used during development.
Three example questions and results: show each question, retrieved information and tool calls, and the agent’s actual answer. Briefly assess each result. Include at least one limitation or failure.
Data and setup: identify your data sources, include a small sample, and describe your node types, relationship types, and properties. Provide the scripts or workflows and instructions needed to recreate your Neo4j data and indexes.
Organise your submission so everything is easy to find from the README.

