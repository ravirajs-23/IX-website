/**
 * scripts/data/services.js
 *
 * Content for the individual /services/<slug>.html pages, built by
 * scripts/build-services.js. Each entry here is one real service page on
 * incubxperts.com — every field is copied verbatim (or a faithful summary,
 * noted where so) from the live page at https://www.incubxperts.com/services/<slug>,
 * fetched and verified directly against the DOM.
 *
 * Only entries actually present in this array get built — an unbuilt
 * service simply isn't linked to yet from services.html/the nav, rather
 * than shipping a half-real page. Add the next one by fetching its live
 * page the same way (see the audit notes in SITE-AUDIT.md) and appending
 * an entry with the same shape.
 *
 * Shape of one entry:
 *   slug            - matches the live site's URL segment
 *   name             - service name, exactly as titled
 *   tagline          - one-line hero subtitle
 *   heroImage        - local path to the real hero background photo
 *   heroCta          - { text, href }
 *   whyMatters       - { title, paragraphs: [html strings] }
 *   ourServices      - { intro, items: [{icon, title, description}] }
 *   process          - { intro, steps: [{icon, title, description}] }
 *   featuredCaseStories - [{slug, title, image}] — real case-studies/ entries
 *   relatedServices  - [{slug|null, name, description, image}] — slug is
 *                       null until that service's own page is built, so the
 *                       card links to services.html meanwhile
 *   metaDescription
 */

module.exports = [
  {
    slug: "ai-adoption-and-strategy",
    name: "AI Adoption & Strategy",
    tagline: "Adopt AI with purpose-built strategies that create real business impact",
    heroImage: "/images/services/hero-ai-adoption.webp",
    heroCta: { text: "Let's Strategize", href: "/contact.html" },
    metaDescription:
      "Purpose-built AI adoption strategies from IncubXperts, designed to deliver real business impact rather than experimental AI pilots.",
    whyMatters: {
      title: "Why Purpose-Driven AI Adoption Matters",
      paragraphs: [
        `AI is reshaping every industry, yet most organizations struggle to turn investments into outcomes. <a href="https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/" target="_blank" rel="noopener noreferrer">Research from MIT</a> shows that up to 95% of companies fail to generate measurable ROI from their AI initiatives.`,
        `The challenge is not the technology. It is the lack of direction. Without a clear adoption strategy, AI efforts often stall in pilots, overspend on infrastructure or models, or get applied where they simply do not create advantage. Knowing where AI works, what it takes to scale, and how to manage total cost of ownership is what separates experimentation from execution.`,
        `That is why we focus on purpose-built AI adoption, with strategies designed to deliver business impact from day one, backed by guardrails, ROI-driven roadmaps, cost-aware architectures and pilots that scale without unnecessary spend.`,
      ],
    },
    ourServices: {
      intro:
        "AI has the potential to revolutionize businesses. Our services help organizations explore AI adoption, understand ROI, control TCO, and embed AI into their products and workflows.",
      items: [
        {
          icon: "/images/services/sub-ai-feasibility.svg",
          title: "AI Feasibility & Readiness",
          description:
            "Assess where your business or product stands today across data, workflows, and technical maturity for AI adoption.",
        },
        {
          icon: "/images/services/sub-high-impact.svg",
          title: "High-Impact Opportunities",
          description:
            "Identify and optimize workflows, user journeys, and product features where AI can create immediate, measurable value. From streamlining processes to improving decision-making, we help you focus efforts where AI delivers the highest return.",
        },
        {
          icon: "/images/services/sub-roadmaps.svg",
          title: "Adoption Roadmaps & Blueprints",
          description:
            "Define a clear adoption strategy covering pilots, scaling path, ROI, guardrails, and governance factors.",
        },
        {
          icon: "/images/services/sub-pilot-design.svg",
          title: "Pilot Design & Scaling",
          description:
            "We help you define the concept, design the pilot, and scale it with confidence. Each pilot is built to validate real-world value, manage cost-per-inference, and create a clear path toward enterprise-wide implementation or product integration.",
        },
        {
          icon: "/images/services/sub-tco.svg",
          title: "TCO Optimization of AI Solutions",
          description:
            "Model the short- and long-term total cost of ownership for AI workloads. Right-size models, optimize architecture choices, benchmark infrastructure costs, and ensure every AI initiative scales efficiently without unpredictable spend.",
        },
        {
          icon: "/images/services/sub-governance.svg",
          title: "Governance, Compliance, & Cost",
          description:
            "Ensure responsible adoption by addressing security, compliance, sustainability, and ongoing cost control from day one.",
        },
        {
          icon: "/images/services/sub-use-cases.svg",
          title: "Use Case Patterns",
          description:
            "Explore AI adoption pathways tailored to your context, from conversational agents and predictive analytics to visual intelligence, sentiment analysis, and autonomous agentic systems across industries and product domains.",
        },
      ],
    },
    process: {
      intro: "Aligned with Gartner’s AI Maturity and Responsible AI principles",
      steps: [
        {
          icon: "/images/services/process-exploration.svg",
          title: "Exploration & Feasibility",
          description:
            "Review current workflows, data, and systems to assess readiness. Identify where AI can deliver measurable business impact and what it means for cost and scalability.",
        },
        {
          icon: "/images/services/process-strategy.svg",
          title: "Strategy, Design & Guardrails",
          description:
            "Define business goals, map high-impact opportunities, and design pilots that prove value early. Built-in guardrails, including model selection, cost parameters, and responsible AI guidelines, ensure every initiative is ethical, efficient, and scalable.",
        },
        {
          icon: "/images/services/process-pilot.svg",
          title: "Pilot Implementation",
          description:
            "Launch pilots in real-world settings to validate ROI and refine adoption strategies. Each pilot is designed for fast validation, measurable outcomes, and a clear path to scale.",
        },
        {
          icon: "/images/services/process-optimisation.svg",
          title: "Continuous Optimisation",
          description:
            "Use human-in-the-loop monitoring, performance tracking, and iterative improvement to keep your AI reliable, efficient, cost-effective, and aligned with evolving business needs.",
        },
        {
          icon: "/images/services/process-deployment.svg",
          title: "Deployment & Scaling",
          description:
            "Expand validated pilots into enterprise systems or embed them into customer-facing products. Enable smooth transition from pilot to production with reliable monitoring, governance, and team support.",
        },
      ],
    },
    featuredCaseStories: [
      {
        slug: "an-ai-assistant-that-provides-pinpoint-insights-through-natural-language-queries",
        title: "An AI Assistant that Provides Pinpoint Insights Through Natural Language Queries",
        image: "/images/case-studies/strapi/33533029_8058230_1_1_5c81c323dd.svg",
      },
      {
        slug: "from-chaos-to-clarity-reimagining-enterprise-knowledge-with-an-ai-assistant",
        title: "From Chaos to Clarity: Reimagining Enterprise Knowledge with an AI Assistant",
        image: "/images/case-studies/strapi/person_using_ai_tool_job_f3289e6275_1_c7051cc32f.webp",
      },
      {
        slug: "leveraging-ai-powered-sentiment-and-acoustic-analysis-for-healthcare-event-speaker-evaluation",
        title: "Leveraging AI-powered Sentiment and Acoustic Analysis for Healthcare Event Speaker Evaluation",
        image: "/images/case-studies/strapi/8656_1_58556fe6cf.svg",
      },
    ],
    relatedServices: [
      {
        slug: "agentic-solutions",
        name: "Agentic Solutions",
        description: "Build AI that thinks, collaborates, and delivers autonomously",
        image: "/images/services/related-agentic-solutions.webp",
      },
      {
        slug: null,
        name: "Workflow Automation",
        description: "Enable seamless, self-operating workflows with intelligent AI-driven automation",
        image: "/images/services/related-workflow-automation.webp",
      },
      {
        slug: null,
        name: "AI-Augmented Product Engineering",
        description: "Build AI-ready products with augmented engineering and human-led precision",
        image: "/images/services/related-ai-augmented-product-engineering.webp",
      },
    ],
    closingCta: {
      title: "Ready to move from AI ambition to execution?",
      buttonText: "Book a Consultation",
      href: "/contact.html",
    },
  },
  {
    slug: "agentic-solutions",
    name: "Agentic Solutions",
    tagline: "Building AI that thinks, collaborates, and delivers autonomously",
    heroImage: "/images/services/hero-agentic-solutions.webp",
    heroCta: { text: "Build with Us", href: "/contact.html" },
    metaDescription:
      "IncubXperts engineers autonomous AI agents that think, collaborate, and deliver, turning agentic AI into measurable business outcomes.",
    whyMatters: {
      title: "The Case for Agentic Systems",
      paragraphs: [
        `Most business operations depend on manual decision points, scattered systems, siloed data, and workflows that break whenever context changes. Even automated processes stop when judgment, interpretation, or cross-system coordination is required.`,
        `Agentic systems close this gap by enabling AI to reason, plan, and act with autonomy across your operations. They bring together data, tools, and intelligence to deliver outcomes with speed, accuracy, and governance.`,
      ],
    },
    ourServices: {
      intro:
        "We design and deliver agentic systems that combine reasoning, context, and collaboration to enable AI to operate autonomously across tools and data. Built using frameworks like CrewAI, LangGraph, AutoGen, and the Model Context Protocol (MCP), these solutions are engineered for reliability, security, and scale.",
      items: [
        {
          icon: "/images/services/sub-ai-feasibility.svg",
          title: "Agentic System Design",
          description:
            "Architect autonomous and multi-agent AI systems around your workflows, data, and governance requirements, designed for safety, context, and collaboration.",
        },
        {
          icon: "/images/services/sub-high-impact.svg",
          title: "Cognitive Workflow Automation",
          description:
            "Transform static business processes into adaptive, goal-oriented workflows that reason, decide, and act across systems.",
        },
        {
          icon: "/images/services/sub-roadmaps.svg",
          title: "Agentic Integration for Existing Systems",
          description:
            "Extend legacy and existing software with agentic capabilities, using protocols like MCP to let AI reason over, connect with, and act through your current tools and environments.",
        },
        {
          icon: "/images/services/sub-context-integration.svg",
          title: "Context Integration",
          description:
            "Connect enterprise systems, APIs, and data into a unified context layer, giving AI agents secure, real-time understanding of your operations through standards like MCP.",
        },
        {
          icon: "/images/services/sub-autonomous-knowledge.svg",
          title: "Autonomous Knowledge Agents",
          description:
            "Deploy AI agents that continuously learn from your internal knowledge bases, delivering precise, context-aware insights and decisions over time.",
        },
        {
          icon: "/images/services/sub-observability.svg",
          title: "Observability & Optimization",
          description:
            "Instrument every agentic workflow with real-time monitoring, traceability, and evaluation, ensuring transparency, reliability, and continuous improvement.",
        },
        {
          icon: "/images/services/sub-deployment-scale.svg",
          title: "Deployment & Scale",
          description:
            "Deliver containerized, production-grade agents with built-in observability, versioning, and compliance, ready to scale across enterprise environments.",
        },
        {
          icon: "/images/services/sub-cost-aware-agentic.svg",
          title: "Cost-Aware Agentic Architecture",
          description:
            "Optimize the total cost of ownership of agentic systems with right-sized models and cost-aware orchestration, ensuring autonomy scales without unpredictable spend.",
        },
      ],
    },
    process: {
      intro: "",
      steps: [
        {
          icon: "/images/services/process-exploration.svg",
          title: "Discover & Define",
          description:
            "Identify the right problems for agentic systems, where reasoning, autonomy, and context can drive meaningful efficiency or decision improvements.",
        },
        {
          icon: "/images/services/process-strategy.svg",
          title: "Design the System",
          description:
            "Design agent roles, reasoning paths, memory, and safeguards. Select orchestration frameworks and LLMs aligned with governance needs and cost-aware scaling patterns.",
        },
        {
          icon: "/images/services/process-pilot.svg",
          title: "Integrate Context",
          description:
            "Connect data, tools, and systems securely, using standards like MCP to enable agents to access live business context in real time.",
        },
        {
          icon: "/images/services/process-optimisation.svg",
          title: "Optimize & Scale",
          description:
            "Continuously refine accuracy, behavior, and impact using telemetry, controlled learning cycles, and optimization of usage patterns for long-term efficiency.",
        },
        {
          icon: "/images/services/process-deployment.svg",
          title: "Build, Test & Deploy",
          description:
            "Engineer, validate, and containerize agents with built-in observability, compliance, and performance metrics. Incorporate cost telemetry to ensure predictable consumption and reliable scaling.",
        },
      ],
    },
    // The live page's own 3 featured case stories (Sales Intelligence
    // Assistant, D365 Sales Assistant, AI RecruitAssist) aren't in our
    // Strapi-synced case-studies/ collection, so these 3 are the closest
    // topical substitutes from what we actually have, not a reproduction
    // of the live page's specific picks.
    featuredCaseStories: [
      {
        slug: "building-a-smarter-donation-ecosystem-with-ai-powered-matchmaking",
        title: "Building a Smarter Donation Ecosystem with AI-Powered Matchmaking",
        image: "/images/case-studies/strapi/Sevadeep_16f52bdd4c.webp",
      },
      {
        slug: "an-ai-powered-legal-document-management-solution",
        title: "An AI-Powered Legal Document Management Solution",
        image: "/images/case-studies/strapi/10032025_Lexicon_Sub_CS_DMS_Cover_Img_1_33db270a17.webp",
      },
      {
        slug: "revolutionizing-workplace-safety-with-ai-driven-incident-reporting",
        title: "Revolutionizing Workplace Safety with AI-Driven Incident Reporting",
        image: "/images/case-studies/strapi/Core_Point_BG_Image_0cbc918ce1.webp",
      },
    ],
    relatedServices: [
      {
        slug: null,
        name: "Workflow Automation",
        description: "Enable seamless, self-operating workflows with intelligent AI-driven automation",
        image: "/images/services/related-workflow-automation.webp",
      },
      {
        slug: null,
        name: "AI-Augmented Product Engineering",
        description: "Build AI-ready products with augmented engineering and human-led precision",
        image: "/images/services/related-ai-augmented-product-engineering.webp",
      },
      {
        slug: null,
        name: "AI-Augmented QA",
        description: "Maximize accuracy and speed with AI-assisted testing and smarter validation",
        image: "/images/services/related-ai-augmented-qa.webp",
      },
    ],
    closingCta: {
      title: "Let's build systems that think, decide, and deliver intelligently",
      buttonText: "Start a Conversation",
      href: "/contact.html",
    },
  },
];
