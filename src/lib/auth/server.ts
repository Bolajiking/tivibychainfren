import { PrivyClient } from "@privy-io/node";
import { config } from "@/lib/config";
import { extractEvmWalletAddressesFromUnknown } from "@/lib/auth/wallets";

export class PrivyAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface AuthenticatedPrivyUser {
  userId: string;
  walletAddress: string;
  walletAddresses: string[];
}

let client: PrivyClient | null = null;

export async function requirePrivyUser(req: Request): Promise<AuthenticatedPrivyUser> {
  const token = getBearerToken(req);
  if (!token) throw new PrivyAuthError(401, "missing_token");

  const appId = config.privy.appId;
  const appSecret = process.env.PRIVY_APP_SECRET ?? "";
  if (!appId || !appSecret) throw new PrivyAuthError(503, "privy_unconfigured");

  const privy = getPrivyClient(appId, appSecret);

  try {
    const verified = await privy.utils().auth().verifyAccessToken(token);
    const user = await privy.users()._get(verified.user_id);
    const walletAddresses = extractEvmWalletAddressesFromUnknown(user);
    if (!walletAddresses.length) throw new PrivyAuthError(403, "no_evm_wallet");

    return {
      userId: verified.user_id,
      walletAddress: walletAddresses[0],
      walletAddresses,
    };
  } catch (error) {
    if (error instanceof PrivyAuthError) throw error;
    throw new PrivyAuthError(401, "invalid_token");
  }
}

function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getPrivyClient(appId: string, appSecret: string): PrivyClient {
  if (!client) {
    client = new PrivyClient({
      appId,
      appSecret,
      jwtVerificationKey: process.env.PRIVY_VERIFICATION_KEY || undefined,
    });
  }
  return client;
}
