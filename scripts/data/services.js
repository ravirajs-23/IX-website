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
        slug: null,
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
];
