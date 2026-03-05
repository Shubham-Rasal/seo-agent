import { start } from 'workflow/api';
import { NextResponse } from 'next/server';
import { seoAnalysisWorkflow } from './workflow';
import { saveReport } from '@/lib/db';
import { COST_CONFIG } from '@/lib/config';
import {
  createPaymentRequirements,
  verifyPayment,
  settlePayment,
  create402Response,
  createPaymentResponseHeader,
  encodePaymentRequired,
} from '@/lib/payment-verification';
import { logAndSanitizeError } from '@/lib/safe-errors';
// Using x402 v2 with CDP facilitator

// Increase timeout for workflow execution (max 300s on Hobby/Pro)
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    // 0. PAYMENT VERIFICATION (BEFORE EVERYTHING ELSE)
    // Check for both v2 ('PAYMENT-SIGNATURE') and v1 ('X-PAYMENT') headers for compatibility
    const paymentHeaderV2 = request.headers.get('PAYMENT-SIGNATURE');
    const paymentHeaderV1 = request.headers.get('X-PAYMENT');
    const paymentHeader = paymentHeaderV2 || paymentHeaderV1;

    const requestUrl = `${new URL(request.url).origin}${new URL(request.url).pathname}`;

    const paymentRequirements = createPaymentRequirements(
      `$${COST_CONFIG.seoAnalysis}`,  // Price in USDC
      'base-sepolia', // Network
      requestUrl,                      // Resource URL
      'SEO Gap Analysis with AI-powered insights'
    );

    // Verify payment
    const verificationResult = await verifyPayment(paymentHeader, paymentRequirements);

    if (!verificationResult.isValid) {
      console.log('[API] Payment required - returning 402');

      // v2 protocol: Set PAYMENT-REQUIRED header with encoded payment requirements
      const paymentRequiredHeader = encodePaymentRequired(paymentRequirements);

      return NextResponse.json(
        create402Response(paymentRequirements, verificationResult.error, verificationResult.payer),
        {
          status: 402,
          headers: {
            'PAYMENT-REQUIRED': paymentRequiredHeader,
          }
        }
      );
    }

    console.log('[API] ✓ Payment verified from:', verificationResult.payer);

    // Settle payment asynchronously (don't block request)
    settlePayment(paymentHeader!, paymentRequirements).then(result => {
      if (result.success) {
        console.log('[API] ✓ Payment settled:', result.txHash);
      } else {
        console.error('[API] ✗ Payment settlement failed:', result.error);
      }
    });

    // 1. CONTENT-TYPE VALIDATION
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 }
      );
    }

    const body = await request.json();
    const { url, userId, targetKeyword } = body;

    // 2. INPUT VALIDATION
    if (!url || typeof url !== 'string' || url.length < 5 || url.length > 500) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    if (!targetKeyword || typeof targetKeyword !== 'string') {
      return NextResponse.json(
        { error: 'Target keyword is required' },
        { status: 400 }
      );
    }

    if (targetKeyword.trim().length < 2 || targetKeyword.trim().length > 100) {
      return NextResponse.json(
        { error: 'Keyword must be 2-100 characters' },
        { status: 400 }
      );
    }

    // 3. SANITIZATION (XSS prevention)
    const sanitizedUrl = url.replace(/<[^>]*>/g, '').trim();

    if (!sanitizedUrl) {
      return NextResponse.json(
        { error: 'Invalid input after sanitization' },
        { status: 400 }
      );
    }

    // 4. URL FORMAT VALIDATION
    let parsedUrl;
    try {
      parsedUrl = new URL(sanitizedUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // 5. TLD VALIDATION (prevent wasting money on invalid domains)
    // Ensure domain has a valid TLD (e.g., v0.app ✓, v0 ✗)
    const hostname = parsedUrl.hostname;
    if (!hostname.includes('.')) {
      return NextResponse.json(
        { error: 'Invalid domain: Must include TLD (e.g., example.com, not just example)' },
        { status: 400 }
      );
    }

    // Check that TLD is at least 2 characters
    const parts = hostname.split('.');
    const tld = parts[parts.length - 1];
    if (tld.length < 2) {
      return NextResponse.json(
        { error: 'Invalid domain: TLD must be at least 2 characters' },
        { status: 400 }
      );
    }

    // 6. CREATE INITIAL REPORT IN DATABASE
    console.log('[API] Creating initial report for:', sanitizedUrl);
    const runId = `seo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await saveReport({
      runId,
      userId,
      userUrl: sanitizedUrl,
      targetKeyword: targetKeyword.trim(),
      createdAt: new Date(),
      status: 'analyzing',
    });

    // 7. START WORKFLOW (with sanitized inputs)
    console.log('[API] Starting SEO analysis workflow');
    const run = await start(seoAnalysisWorkflow, [{
      runId,
      url: sanitizedUrl,
      targetKeyword: targetKeyword.trim(),
    }]);

    console.log('[API] ✓ Workflow started:', run.runId);

    // 8. RETURN SUCCESS
    // Note: PAYMENT-RESPONSE header is omitted because settlement is async
    // Client can check settlement status separately if needed
    // Return our custom runId (not run.runId) so client can access the report
    return NextResponse.json({
      success: true,
      runId: runId,  // Use our custom runId that matches database
      message: 'SEO analysis started',
    });
  } catch (error) {
    const safeError = logAndSanitizeError(error, 'workflow-start');
    return NextResponse.json(
      {
        success: false,
        error: safeError,
      },
      { status: 500 }
    );
  }
}
