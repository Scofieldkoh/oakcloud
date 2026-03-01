import { SignJWT, jwtVerify } from 'jose';

const TOKEN_ISSUER = 'oakcloud-share';
const TOKEN_AUDIENCE = 'share-verification';
const TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 hour
const MIN_SECRET_LENGTH = 32;

function getShareVerificationSecret(): Uint8Array {
  const secret = process.env.SHARE_VERIFICATION_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SHARE_VERIFICATION_SECRET (or JWT_SECRET) is required in production');
    }
    return new TextEncoder().encode('development-share-verification-secret-only');
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Share verification secret must be at least ${MIN_SECRET_LENGTH} characters long`);
  }

  return new TextEncoder().encode(secret);
}

const SHARE_VERIFICATION_SECRET = getShareVerificationSecret();

/**
 * Create a signed verification token for password-protected shares.
 */
export async function createShareVerificationToken(shareId: string): Promise<string> {
  return new SignJWT({ shareId, verified: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRY_SECONDS} seconds`)
    .sign(SHARE_VERIFICATION_SECRET);
}

/**
 * Verify a signed share verification token and match it to the share ID.
 */
export async function verifyShareVerificationToken(
  verificationToken: string,
  shareId: string
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(verificationToken, SHARE_VERIFICATION_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    return payload.shareId === shareId && payload.verified === true;
  } catch {
    return false;
  }
}
