// Workflow step implementations for SEO Gap Analysis
import { searchWeb, fetchPageData, fetchMultiplePages } from '@/lib/hyperbrowser';
import { SEO_EXTRACTION_SCHEMA, type SEOData } from '@/lib/schemas';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import OpenAI from 'openai';
import type { StructuredReportData } from '@/types/report-data';
import { safeParse } from '@/lib/safe-json';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to create x402-enabled fetch function for server-side payments to Hyperbrowser
function createX402Fetch(): typeof fetch {
  // For server-side, use a backend wallet (v2 client API)
  const privateKey = process.env.X402_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      'X402_WALLET_PRIVATE_KEY is not set. Add it to .env - this wallet pays Hyperbrowser for search/fetch. ' +
      'It needs USDC on Base mainnet.'
    );
  }
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });
  const signer = toClientEvmSigner(account, publicClient);

  // Create x402 client and register EVM scheme
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  console.log('[x402 Client] Created v2 client for Hyperbrowser payments');

  // Return wrapped fetch with payment handling
  return wrapFetchWithPayment(fetch, client);
}

/**
 * Step 1: Fetch User's Site
 * Extracts SEO data from the user's website
 */
export async function fetchUserSite(url: string): Promise<SEOData> {
  console.log(`[Step 1] Fetching user site: ${url}`);

  const fetchFunc = createX402Fetch();
  const data = await fetchPageData<SEOData>(url, SEO_EXTRACTION_SCHEMA, fetchFunc);

  console.log(`[Step 1] ✓ Fetched: ${data.title} (${data.wordCount} words)`);
  return data;
}

/**
 * Step 2: Discover Keywords with OpenAI
 * Analyzes site content to identify target keywords
 */
export async function discoverKeywords(
  siteData: SEOData
): Promise<{ primary: string; secondary: string[] }> {
  console.log('[Step 2] Discovering keywords from site content');

  const prompt = `Analyze this website and identify CATEGORY keywords for SEO competitor analysis.

IMPORTANT: Do NOT use brand names in keywords. Focus on what the product/service IS, not what it's CALLED.

Title: ${siteData.title}
Meta Description: ${siteData.metaDescription}
H1 Tags: ${siteData.h1.join(', ')}
H2 Tags: ${siteData.h2.slice(0, 10).join(', ')}
Main Content Preview: ${siteData.content.substring(0, 2000)}

Steps to follow:
1. Identify the brand name from the title/content (if this is a brand's website)
2. Determine what CATEGORY or PRODUCT TYPE this site represents
3. Create generic category keywords that competitors would also rank for

Examples:
- If site is "Nike.com" selling shoes → Primary: "athletic footwear" NOT "Nike shoes"
- If site is "Canva.com" for design → Primary: "graphic design software" NOT "Canva design tools"
- If site is "Stripe.com" for payments → Primary: "payment processing platform" NOT "Stripe payment"
- If site is "Monday.com" for project mgmt → Primary: "project management software" NOT "Monday.com features"

Return GENERIC category keywords (no brand names) as JSON:
{
  "primary": "category keyword (2-5 words, no brand names)",
  "secondary": ["related category term 1", "related category term 2", "related category term 3", "related category term 4"],
  "intent": "commercial",
  "reasoning": "Brief explanation focusing on the product category"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an SEO expert. Respond with valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = safeParse<{ primary: string; secondary: string[]; reasoning: string }>(
    response.choices[0].message.content || '{}',
    { primary: '', secondary: [], reasoning: '' }
  );

  console.log(`[Step 2] ✓ Discovered primary keyword: "${result.primary}"`);
  console.log(`[Step 2] ✓ Secondary keywords: ${result.secondary?.join(', ') || 'none'}`);

  return result;
}

/**
 * Step 3: Identify Competitor Companies with Hybrid Approach
 * 1. Search Google for the user's target keyword to see what's actually ranking
 * 2. Use LLM to identify top competitors in that category
 * 3. Filter out blogs/reviews, keep only actual product/service providers
 */
export async function searchCompetitors(
  keyword: string,
  userSiteData: SEOData
): Promise<Array<{ rank: number; title: string; url: string; description: string }>> {
  console.log(`[Step 3] Identifying competitors for keyword: "${keyword}"`);

  const fetchFunc = createX402Fetch();

  // Step 3a: Search Google for the target keyword (first 20 results)
  console.log(`[Step 3a] Searching Google for: "${keyword}"`);
  const googleResults: Array<{ title: string; url: string; description: string }> = [];

  try {
    // Get first 2 pages of Google results (20 results)
    for (let page = 1; page <= 2; page++) {
      const pageResults = await searchWeb(keyword, page, fetchFunc);
      googleResults.push(...pageResults);
    }
    console.log(`[Step 3a] ✓ Found ${googleResults.length} Google results for "${keyword}"`);
  } catch (error) {
    console.error('[Step 3a] Error searching Google:', error instanceof Error ? error.message : 'Unknown error');
  }

  // Step 3b: Ask LLM to identify competitors in this category AND filter Google results
  const prompt = `You are identifying COMPETITOR PRODUCTS/SERVICES for the keyword: "${keyword}"

GOOGLE SEARCH RESULTS for "${keyword}":
${googleResults.slice(0, 15).map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description}`).join('\n\n')}

YOUR TASK:
1. From the Google results above, identify which ones are ACTUAL PRODUCTS/SERVICES (not blogs, reviews, or listicles)
2. Add any other major competitors in the "${keyword}" category that you know of

IMPORTANT FILTERING RULES:
✓ INCLUDE: Actual product/service providers (e.g., Wix, Squarespace, Shopify for "website builder")
✓ INCLUDE: Companies offering solutions in this category
✓ INCLUDE: Both established players AND emerging startups

✗ EXCLUDE: Review sites (PCMag, TechRadar, G2, Capterra, etc.)
✗ EXCLUDE: Blog posts or "Best [keyword]" listicles
✗ EXCLUDE: Comparison sites or aggregators
✗ EXCLUDE: Wikipedia, Reddit, Quora, forums
✗ EXCLUDE: News articles or press releases

For each competitor, provide:
- company: Company/Product name
- url: Their main product URL (extract from Google results or use known URL)
- description: Brief description
- source: "google" (if from search results) or "knowledge" (if from your knowledge)

Return 8-12 competitors as JSON:
{
  "competitors": [
    {
      "company": "Company Name",
      "url": "https://company.com",
      "description": "Brief description of their product/service",
      "source": "google" or "knowledge"
    }
  ]
}

FOCUS: Find competitors specifically for "${keyword}", NOT for the user's broader business category.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a competitive analysis expert. Filter Google results to find ONLY actual product/service competitors. Exclude blogs, reviews, and listicles. Respond with valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = safeParse<{ competitors: any[] }>(
    response.choices[0].message.content || '{ "competitors": [] }',
    { competitors: [] }
  );

  // Step 3c: Process and verify competitor URLs
  const verifiedCompetitors: Array<{ rank: number; title: string; url: string; description: string }> = [];

  // Prioritize Google results over LLM knowledge (they're actually ranking)
  const googleCompetitors = result.competitors.filter((c: any) => c.source === 'google');
  const knowledgeCompetitors = result.competitors.filter((c: any) => c.source === 'knowledge');
  const sortedCompetitors = [...googleCompetitors, ...knowledgeCompetitors];

  for (let i = 0; i < Math.min(sortedCompetitors.length, 12); i++) {
    const comp = sortedCompetitors[i];
    let finalUrl = comp.url;
    let title = comp.company;
    let description = comp.description;

    // If URL doesn't start with http, add https://
    if (!finalUrl.startsWith('http')) {
      finalUrl = `https://${finalUrl}`;
    }

    // Clean up URL - remove paths if it's clearly a blog post or article
    try {
      const urlObj = new URL(finalUrl);
      // If path contains blog indicators, try to get just the domain
      if (urlObj.pathname.includes('/blog') ||
          urlObj.pathname.includes('/article') ||
          urlObj.pathname.includes('/news') ||
          urlObj.pathname.match(/\/\d{4}\//)) { // Year in path (like /2024/)
        console.log(`[Step 3c] Detected blog/article URL, using domain only: ${urlObj.hostname}`);
        finalUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      }
    } catch (error) {
      console.warn(`[Step 3c] Could not parse URL: ${finalUrl}`);
    }

    verifiedCompetitors.push({
      rank: i + 1,
      title: title,
      url: finalUrl,
      description: description,
    });
  }

  console.log(`[Step 3] ✓ Identified ${verifiedCompetitors.length} competitors for "${keyword}":`);
  const googleCount = verifiedCompetitors.filter((_, i) => i < googleCompetitors.length).length;
  console.log(`  - ${googleCount} from Google search results (actually ranking)`);
  console.log(`  - ${verifiedCompetitors.length - googleCount} from LLM knowledge`);
  verifiedCompetitors.forEach((c, i) => {
    const source = i < googleCount ? '🔍' : '🧠';
    console.log(`  ${source} ${i + 1}. ${c.title} - ${c.url}`);
  });

  return verifiedCompetitors;
}

/**
 * Step 3b: Detect Google Ranking Position for Target Keyword
 * Searches Google for the target keyword and finds user's ranking position
 */
export async function detectGoogleRanking(
  targetKeyword: string,
  userUrl: string
): Promise<{ rank: number | null; foundUrl: string | null }> {
  console.log(`[Step 3b] Checking Google ranking for: "${targetKeyword}"`);

  try {
    const fetchFunc = createX402Fetch();

    // Search for top 100 results (10 pages x 10 results)
    const allResults: Array<{ title: string; url: string; description: string }> = [];

    for (let page = 1; page <= 10; page++) {
      const pageResults = await searchWeb(targetKeyword, page, fetchFunc);
      allResults.push(...pageResults);

      // Early exit if we found the user's domain
      const userDomain = new URL(userUrl).hostname.replace('www.', '');
      const foundInPage = pageResults.find(result => {
        try {
          const resultDomain = new URL(result.url).hostname.replace('www.', '');
          return resultDomain === userDomain;
        } catch {
          return false;
        }
      });

      if (foundInPage) {
        const rank = allResults.indexOf(foundInPage) + 1;
        console.log(`[Step 3b] ✓ Found at position ${rank}: ${foundInPage.url}`);
        return { rank, foundUrl: foundInPage.url };
      }
    }

    console.log(`[Step 3b] Not found in top 100 results`);
    return { rank: null, foundUrl: null };

  } catch (error) {
    console.error('[Step 3b] Error detecting ranking:', error instanceof Error ? error.message : 'Unknown error');
    return { rank: null, foundUrl: null };
  }
}

/**
 * Step 4: Fetch All Competitor Pages
 * Extracts SEO data from competitor pages in parallel
 */
export async function fetchCompetitorData(
  competitors: Array<{ rank: number; url: string; title: string; description: string }>,
  keyword: string
): Promise<Array<{
  keyword: string;
  rank: number;
  url: string;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  images: number;
  hasSchema: boolean;
  content: string;
}>> {
  console.log(`[Step 4] Fetching ${competitors.length} competitor pages`);

  const fetchFunc = createX402Fetch();
  const urls = competitors.map(c => c.url);

  const seoDataArray = await fetchMultiplePages<SEOData>(urls, SEO_EXTRACTION_SCHEMA, fetchFunc);

  // Combine with competitor info
  const competitorData = competitors.map((comp, index) => {
    const seoData = seoDataArray[index];

    if (!seoData) {
      // Return placeholder for failed fetches
      return {
        keyword,
        rank: comp.rank,
        url: comp.url,
        title: comp.title,
        metaDescription: comp.description,
        h1: [],
        h2: [],
        h3: [],
        wordCount: 0,
        internalLinks: 0,
        externalLinks: 0,
        images: 0,
        hasSchema: false,
        content: '',
      };
    }

    return {
      keyword,
      rank: comp.rank,
      url: comp.url,
      ...seoData,
    };
  }).filter(data => data.wordCount > 0); // Filter out failed fetches

  console.log(`[Step 4] ✓ Successfully fetched ${competitorData.length} competitor pages`);
  return competitorData;
}

/**
 * Step 5: Analyze Patterns with OpenAI
 * Identifies common patterns across top-performing competitors
 */
export async function analyzePatterns(
  userSite: SEOData,
  competitors: Array<any>
): Promise<{
  avgWordCount: number;
  avgH2Count: number;
  avgH3Count: number;
  avgInternalLinks: number;
  avgExternalLinks: number;
  commonTopics: string[];
  technicalPatterns: any;
}> {
  console.log('[Step 5] Analyzing patterns in competitor data');

  // Calculate averages
  const avgWordCount = Math.round(
    competitors.reduce((sum, c) => sum + c.wordCount, 0) / competitors.length
  );
  const avgH2Count = Math.round(
    competitors.reduce((sum, c) => sum + c.h2.length, 0) / competitors.length
  );
  const avgH3Count = Math.round(
    competitors.reduce((sum, c) => sum + c.h3.length, 0) / competitors.length
  );
  const avgInternalLinks = Math.round(
    competitors.reduce((sum, c) => sum + c.internalLinks, 0) / competitors.length
  );
  const avgExternalLinks = Math.round(
    competitors.reduce((sum, c) => sum + c.externalLinks, 0) / competitors.length
  );

  // Analyze topics with OpenAI
  const topCompetitors = competitors.slice(0, 5);
  const competitorSummary = topCompetitors.map(c => ({
    title: c.title,
    h2Topics: c.h2.slice(0, 10),
    wordCount: c.wordCount,
  }));

  const prompt = `Analyze these top 5 ranking pages and identify common content themes/topics that appear across multiple pages:

${JSON.stringify(competitorSummary, null, 2)}

Return a JSON array of 5-10 common topics that appear in most pages:
{
  "commonTopics": ["topic 1", "topic 2", ...]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an SEO analyst. Respond with valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = safeParse<{ commonTopics: string[] }>(
    response.choices[0].message.content || '{ "commonTopics": [] }',
    { commonTopics: [] }
  );

  console.log(`[Step 5] ✓ Average metrics: ${avgWordCount} words, ${avgH2Count} H2s`);
  console.log(`[Step 5] ✓ Common topics: ${result.commonTopics?.join(', ') || 'none'}`);

  return {
    avgWordCount,
    avgH2Count,
    avgH3Count,
    avgInternalLinks,
    avgExternalLinks,
    commonTopics: result.commonTopics,
    technicalPatterns: {
      schemaUsage: competitors.filter(c => c.hasSchema).length,
      totalCompetitors: competitors.length,
    },
  };
}

/**
 * Step 6: Identify Gaps with OpenAI
 * Compares user site vs competitors and identifies specific gaps
 */
export async function identifyGaps(
  userSite: SEOData,
  patterns: any,
  competitors: Array<any>
): Promise<Array<{
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  finding: string;
  impact: string;
  recommendation: string;
  estimatedEffort?: string;
}>> {
  console.log('[Step 6] Identifying SEO gaps');

  const prompt = `You are an SEO consultant. Analyze this website against competitor benchmarks and identify ALL significant SEO gaps.

USER SITE:
- Title: ${userSite.title}
- Meta Description: ${userSite.metaDescription}
- Word Count: ${userSite.wordCount}
- H1: ${userSite.h1.join(', ')}
- H2 Count: ${userSite.h2.length} (${userSite.h2.slice(0, 5).join(', ')})
- H3 Count: ${userSite.h3.length}
- Internal Links: ${userSite.internalLinks}
- Has Schema Markup: ${userSite.hasSchema}

COMPETITOR BENCHMARKS:
- Avg Word Count: ${patterns.avgWordCount}
- Avg H2 Count: ${patterns.avgH2Count}
- Avg H3 Count: ${patterns.avgH3Count}
- Avg Internal Links: ${patterns.avgInternalLinks}
- Common Topics: ${patterns.commonTopics.join(', ')}
- Schema Usage: ${patterns.technicalPatterns.schemaUsage}/${patterns.technicalPatterns.totalCompetitors} have schema

Identify ALL significant SEO gaps (typically 4-10). For each gap:
- category: e.g., "Content Depth", "Content Structure", "Technical SEO", "Topic Coverage", "On-Page Optimization"
- severity: "critical" (major ranking factor), "high" (significant impact), "medium" (moderate impact), or "low" (minor improvement)
- finding: Specific, data-driven description with metrics
- impact: Quantify the ranking/traffic impact (e.g., "Could improve rankings by 15-20%")
- recommendation: Specific, actionable fix with target metrics
- estimatedEffort: "Quick win (<1 week)", "Medium (1-4 weeks)", or "Long-term (1+ months)"

IMPORTANT - Schema Markup Recommendations:
If the user site is missing schema markup (hasSchema: false), provide SPECIFIC schema.org types they should implement based on the page type:
- For SaaS/Product pages: Organization, Product, SoftwareApplication, FAQPage, BreadcrumbList
- For E-commerce: Product, Offer, AggregateRating, Review, Organization
- For Content/Blog: Article, BlogPosting, Person (author), Organization, BreadcrumbList
- For Local Business: LocalBusiness, Organization, PostalAddress, OpeningHours
- For Services: Service, ProfessionalService, Organization, FAQPage
- For Landing Pages: Organization, WebSite, WebPage

In the recommendation field for schema gaps, list 3-5 specific schema types with brief explanations, formatted as:
"Implement structured data using schema.org markup: 1) Organization schema (company info, logo, social links), 2) Product/SoftwareApplication schema (features, pricing, ratings), 3) FAQPage schema (common questions), 4) BreadcrumbList schema (navigation hierarchy)"

Return as JSON:
{
  "gaps": [
    {
      "category": "Content Depth",
      "severity": "high",
      "finding": "Your page has ${userSite.wordCount} words vs ${patterns.avgWordCount} average",
      "impact": "Content depth is a top 3 ranking factor. Sites with 2,500+ words rank 20% higher on average.",
      "recommendation": "Add ${Math.max(0, patterns.avgWordCount - userSite.wordCount)} more words covering: ${patterns.commonTopics.slice(0, 3).join(', ')}",
      "estimatedEffort": "Medium (1-4 weeks)"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an SEO expert. Respond with valid JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = safeParse<{ gaps: any[] }>(
    response.choices[0].message.content || '{ "gaps": [] }',
    { gaps: [] }
  );

  console.log(`[Step 6] ✓ Identified ${result.gaps?.length || 0} SEO gaps`);
  return result.gaps || [];
}

/**
 * Step 7: Generate Recommendations
 * Creates prioritized, actionable recommendations
 */
export async function generateRecommendations(
  gaps: Array<any>,
  userSite: SEOData,
  discoveredKeywords?: { primary: string; secondary: string[] }
): Promise<{
  highPriority: string[];
  mediumPriority: string[];
  lowPriority: string[];
  contentOutline: string;
}> {
  console.log('[Step 7] Generating recommendations');

  // Group by severity
  const criticalPriority = gaps.filter(g => g.severity === 'critical').map(g => g.recommendation);
  const highPriority = gaps.filter(g => g.severity === 'high').map(g => g.recommendation);
  const mediumPriority = gaps.filter(g => g.severity === 'medium').map(g => g.recommendation);
  const lowPriority = gaps.filter(g => g.severity === 'low').map(g => g.recommendation);

  // Combine critical and high for backwards compatibility
  const combinedHighPriority = [...criticalPriority, ...highPriority];

  // Use discovered keyword, not the site title
  const primaryKeyword = discoveredKeywords?.primary || userSite.title || 'the topic';
  const currentH1 = userSite.h1.join(', ') || 'None';

  const prompt = `Based on these SEO gaps, create a detailed content outline for improving the page:

PRIMARY KEYWORD TO TARGET: ${primaryKeyword}
CURRENT PAGE H1: ${currentH1}
CURRENT H2 SECTIONS:
${userSite.h2.length > 0 ? userSite.h2.join('\n') : 'None'}

GAPS TO ADDRESS:
${gaps.map(g => `- ${g.finding}`).join('\n')}

Create a comprehensive content outline with:
- Recommended H1: Create a NEW H1 that's DIFFERENT from the current H1 ("${currentH1}"). Use the primary keyword "${primaryKeyword}" naturally. Make it more compelling and SEO-friendly than the current one.
- 8-12 H2 sections (numbered format: "### 1. Section Title")
- For each section, include: title, estimated word count in parentheses like "(Estimated Word Count: 200)", and a brief description
- Use the actual keyword "${primaryKeyword}" throughout, NOT placeholders like [Topic]

IMPORTANT: The recommended H1 should be DIFFERENT from the current H1. Don't just repeat what they already have.

Format as markdown with this exact structure:
## Recommended H1
**"Your NEW H1 here using the keyword"**

## H2 Sections
### 1. Section Title (Estimated Word Count: 200)
Brief description of what to cover in this section.

### 2. Next Section Title (Estimated Word Count: 250)
Brief description...

Include a "Total Estimated Word Count" at the end.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an SEO content strategist.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.5,
  });

  const contentOutline = response.choices[0].message.content || '';

  console.log(`[Step 7] ✓ Generated recommendations (${combinedHighPriority.length} high priority)`);

  return {
    highPriority: combinedHighPriority,
    mediumPriority,
    lowPriority,
    contentOutline,
  };
}

/**
 * Step 8: Generate Structured Report Data
 * Creates structured JSON data for the report (no HTML generation)
 */
export async function generateReportData(
  reportData: {
    userSiteData: any;
    discoveredKeywords: any;
    patterns: any;
    gaps: Array<any>;
    recommendations: any;
    googleRanking?: number | null;
    googleRankingUrl?: string | null;
    competitorData?: Array<any>;
  }
): Promise<StructuredReportData> {
  console.log('[Step 8] Generating structured report data');

  // Extract key findings from gaps
  const keyFindings = reportData.gaps
    .slice(0, 5)
    .map((gap: any) => gap.finding);

  // Generate executive summary overview
  const highGaps = reportData.gaps.filter((g: any) => g.severity === 'high');
  const mediumGaps = reportData.gaps.filter((g: any) => g.severity === 'medium');
  const mainGapCategories = [...new Set(highGaps.map((g: any) => g.category))].slice(0, 3);
  
  const overviewPrompt = `Create a concise, professional executive summary (2-3 sentences) for this SEO competitive analysis report:

Website: ${reportData.userSiteData.title || reportData.userSiteData.url}
URL: ${reportData.userSiteData.url}
Target Keyword: "${reportData.discoveredKeywords.primary}" (user wants to rank for this)
${reportData.googleRanking
  ? `Current Google Ranking: Position #${reportData.googleRanking}`
  : 'Current Google Ranking: Not found in top 100 results'}

Key Issues: ${highGaps.length} critical/high-priority gaps, ${mediumGaps.length} medium-priority gaps
Main Gap Categories: ${mainGapCategories.join(', ')}

Your Site Metrics vs Competitors:
- ${reportData.userSiteData.wordCount} words (vs ${reportData.patterns.avgWordCount} competitor avg)
- ${reportData.userSiteData.h2.length} H2s (vs ${reportData.patterns.avgH2Count} competitor avg)

Write a summary that:
1. States the current Google ranking position prominently (or "not ranking in top 100")
2. Mentions they're targeting "${reportData.discoveredKeywords.primary}"
3. Highlights the most critical gap that needs immediate attention
4. Sets a positive, actionable tone about improvement potential

DO NOT mention any 0-100 score. Focus on the actual Google ranking position.

Return only the summary text (2-3 sentences), no markdown, no quotes.`;

  const overviewResponse = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an SEO consultant. Write concise, professional summaries.'
      },
      {
        role: 'user',
        content: overviewPrompt
      }
    ],
    temperature: 0.5,
    max_tokens: 150,
  });

  const overview = overviewResponse.choices[0].message.content || '';

  // Parse content outline from markdown
  const parseContentOutline = (outlineText: string) => {
    const lines = outlineText.split('\n').filter(l => l.trim());
    let recommendedH1 = '';
    const h2Sections: Array<{ title: string; estimatedWordCount: number; description: string }> = [];
    let totalWordCount = 0;
    let currentSection: { title: string; estimatedWordCount: number; description: string } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Extract H1 (usually starts with # or "Recommended H1:")
      // Handle format: "## Recommended H1" followed by "**\"H1 text\"**"
      if (trimmed.toLowerCase().includes('recommended h1')) {
        // Look ahead for the next line which should have the H1 in quotes
        const nextLineIndex = lines.indexOf(trimmed) + 1;
        if (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trim();
          // Extract from format: **"H1 text"** or "H1 text"
          const h1Match = nextLine.match(/\*\*["'](.+?)["']\*\*|["'](.+?)["']|(.+)/);
          if (h1Match) {
            recommendedH1 = (h1Match[1] || h1Match[2] || h1Match[3] || '').trim();
            if (recommendedH1) continue;
          }
        }
      } else if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
        // Single # is H1
        recommendedH1 = trimmed.replace(/^#+\s*/, '').trim();
        // Remove markdown formatting
        recommendedH1 = recommendedH1.replace(/\*\*["'](.+?)["']\*\*|["'](.+?)["']/, '$1$2');
        if (recommendedH1) continue;
      } else if (trimmed.match(/^\*\*["'].+?["']\*\*|^["'].+?["']$/)) {
        // Standalone H1 in quotes
        const h1Match = trimmed.match(/["'](.+?)["']/);
        if (h1Match && !recommendedH1) {
          recommendedH1 = h1Match[1].trim();
          continue;
        }
      }

      // Extract H2 sections (usually start with ## or - or numbered)
      // Handle format: "### 1. Section Title (Estimated Word Count: 200)"
      if (trimmed.startsWith('##') || trimmed.match(/^[-*]\s+/) || trimmed.match(/^\d+\.\s+/) || trimmed.match(/^###\s+\d+\./)) {
        // Save previous section if exists
        if (currentSection) {
          h2Sections.push(currentSection);
          totalWordCount += currentSection.estimatedWordCount;
        }

        // Parse new section - handle multiple formats
        // Format 1: "### 1. Title (Estimated Word Count: 200)"
        // Format 2: "## Title (200 words)"
        // Format 3: "- Title (~200 words)"
        let match = trimmed.match(/(?:###\s+\d+\.\s*|##\s*|[-*]\s*|\d+\.\s*)(.+?)(?:\s*\([^)]*[Ee]stimated\s+[Ww]ord\s+[Cc]ount[:\s]*(\d+)[^)]*\)|\(~?(\d+)\s*words?\))/i);
        if (!match) {
          // Try simpler format
          match = trimmed.match(/(?:###\s+\d+\.\s*|##\s*|[-*]\s*|\d+\.\s*)(.+?)(?:\s*\(~?(\d+)\s*words?\))?/i);
        }
        
        if (match) {
          const title = match[1].trim();
          // Word count could be in match[2] or match[3] depending on format
          const wordCount = match[2] ? parseInt(match[2]) : (match[3] ? parseInt(match[3]) : 200);
          currentSection = {
            title,
            estimatedWordCount: wordCount,
            description: '',
          };
        }
      } else if (currentSection && trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.match(/^Total\s+Estimated/i)) {
        // This is a description line for the current section
        // Skip lines that are just separators or total word count
        if (trimmed !== '---' && !trimmed.match(/^Total\s+Estimated/i)) {
          if (currentSection.description) {
            currentSection.description += ' ' + trimmed;
          } else {
            currentSection.description = trimmed;
          }
        }
      } else if (trimmed.match(/^Total\s+Estimated\s+Word\s+Count[:\s]*(\d+)/i)) {
        // Extract total from summary line if provided
        const totalMatch = trimmed.match(/(\d+)/);
        if (totalMatch && totalWordCount === 0) {
          totalWordCount = parseInt(totalMatch[1]);
        }
      }
    }

    // Don't forget the last section
    if (currentSection) {
      h2Sections.push(currentSection);
      totalWordCount += currentSection.estimatedWordCount;
    }

    // If we didn't find H1, try to extract from first line
    if (!recommendedH1 && lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.startsWith('#')) {
        recommendedH1 = firstLine.replace(/^#+\s*/, '').trim();
      } else if (!firstLine.startsWith('##') && !firstLine.match(/^[-*]\s+/) && !firstLine.match(/^\d+\.\s+/)) {
        recommendedH1 = firstLine;
      }
    }

    // If no word count found, estimate based on sections
    if (totalWordCount === 0 && h2Sections.length > 0) {
      totalWordCount = h2Sections.length * 200;
      h2Sections.forEach(s => s.estimatedWordCount = 200);
    }

    return {
      recommendedH1: recommendedH1 || 'Comprehensive Guide',
      h2Sections,
      totalEstimatedWordCount: totalWordCount || 2000,
    };
  };

  const contentOutline = parseContentOutline(reportData.recommendations.contentOutline || '');

  // Structure recommendations by priority
  // Map recommendations to their corresponding gaps for better structure
  const structureRecommendations = (recommendations: string[], priority: 'high' | 'medium' | 'low', gaps: Array<any>) => {
    return recommendations.map((rec, index) => {
      const trimmed = rec.trim();
      
      // Try to find the corresponding gap for this recommendation
      const correspondingGap = gaps.find((g: any) => 
        g.severity === priority && 
        (g.recommendation === trimmed || g.recommendation.includes(trimmed.substring(0, 50)))
      );

      let title = trimmed;
      let description = '';
      let actionItems: string[] = [];

      // If we found a corresponding gap, use its data for better structure
      if (correspondingGap) {
        title = correspondingGap.category || trimmed.substring(0, 60);
        description = correspondingGap.impact || '';
        actionItems = [correspondingGap.recommendation || trimmed];
      } else {
        // Try to extract title and description from the recommendation text
        // Many recommendations start with action verbs like "Add", "Incorporate", "Expand"
        const actionMatch = trimmed.match(/^(Add|Incorporate|Expand|Consider|Implement|Create|Build|Develop|Improve|Enhance|Optimize|Update|Fix|Remove|Replace)\s+(.+)/i);
        if (actionMatch) {
          title = actionMatch[1] + ' ' + actionMatch[2].split(/[.,]/)[0].trim();
          description = trimmed;
          actionItems = [trimmed];
        } else if (trimmed.includes(':')) {
          // Check if it has a colon separator (title: description)
          const parts = trimmed.split(':');
          title = parts[0].trim();
          description = parts.slice(1).join(':').trim();
          actionItems = [description || trimmed];
        } else {
          // Use first part as title, rest as description
          const firstSentence = trimmed.split(/[.!?]/)[0];
          if (firstSentence.length < 80) {
            title = firstSentence;
            description = trimmed.substring(firstSentence.length).trim();
  } else {
            title = trimmed.substring(0, 60) + '...';
            description = trimmed;
          }
          actionItems = [trimmed];
        }
      }

      // Clean up title (remove trailing periods, etc.)
      title = title.replace(/^[A-Z]\w+\s+/, ''); // Remove leading action verb if it makes title too generic
      if (title.length > 80) {
        title = title.substring(0, 77) + '...';
      }

      return {
        title: title || 'SEO Recommendation',
        description: description || trimmed,
        actionItems: actionItems.length > 0 ? actionItems : [trimmed],
      };
    });
  };

  const structuredData: StructuredReportData = {
    executiveSummary: {
      overview,
      keyFindings,
      googleRanking: reportData.googleRanking,
      googleRankingUrl: reportData.googleRankingUrl,
    },
    yourMetrics: {
      wordCount: reportData.userSiteData.wordCount,
      h2Count: reportData.userSiteData.h2.length,
      h3Count: reportData.userSiteData.h3.length,
      internalLinks: reportData.userSiteData.internalLinks,
      externalLinks: reportData.userSiteData.externalLinks,
      hasSchema: reportData.userSiteData.hasSchema,
    },
    competitorBenchmarks: {
      avgWordCount: reportData.patterns.avgWordCount,
      avgH2Count: reportData.patterns.avgH2Count,
      avgH3Count: reportData.patterns.avgH3Count,
      avgInternalLinks: reportData.patterns.avgInternalLinks,
      avgExternalLinks: reportData.patterns.avgExternalLinks,
      schemaUsage: reportData.patterns.technicalPatterns.schemaUsage,
      totalCompetitors: reportData.patterns.technicalPatterns.totalCompetitors,
    },
    gaps: reportData.gaps,
    recommendations: {
      highPriority: structureRecommendations(reportData.recommendations.highPriority || [], 'high', reportData.gaps),
      mediumPriority: structureRecommendations(reportData.recommendations.mediumPriority || [], 'medium', reportData.gaps),
      lowPriority: structureRecommendations(reportData.recommendations.lowPriority || [], 'low', reportData.gaps),
    },
    contentOutline,
    keywords: {
      primary: reportData.discoveredKeywords.primary,
      secondary: reportData.discoveredKeywords.secondary || [],
    },
    competitors: (reportData.competitorData || []).map((comp: any) => ({
      rank: comp.rank,
      url: comp.url,
      title: comp.title || comp.url,
      wordCount: comp.wordCount || 0,
      h2Count: comp.h2?.length || 0,
    })),
  };

  console.log('[Step 8] ✓ Generated structured report data');
  return structuredData;
}
