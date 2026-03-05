// GET /api/health — public heartbeat, no auth, no payment gate
export async function GET() {
  return Response.json({
    status: "ok",
    agent: process.env.AGENT_NAME ?? "SEO Gap Analysis Agent",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "1.0.0",
  });
}
