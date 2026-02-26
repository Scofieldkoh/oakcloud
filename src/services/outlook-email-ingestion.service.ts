import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { resolveConnector, incrementConnectorUsage } from '@/services/connector.service';
import { createContactDetail } from '@/services/contact-detail.service';

const log = createLogger('outlook-email-ingestion');

interface MicrosoftGraphCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

interface GraphEmailAddress {
  address?: string | null;
  name?: string | null;
}

interface GraphParticipant {
  emailAddress?: GraphEmailAddress | null;
}

export interface GraphMessage {
  subject?: string | null;
  from?: GraphParticipant | null;
  sender?: GraphParticipant | null;
  toRecipients?: GraphParticipant[] | null;
  ccRecipients?: GraphParticipant[] | null;
  bccRecipients?: GraphParticipant[] | null;
  replyTo?: GraphParticipant[] | null;
}

export interface IngestOutlookCompanyEmailsInput {
  tenantId: string;
  userId: string;
  companyId: string;
  mailboxUserId?: string;
  domains?: string[];
  lookbackDays?: number;
  maxMessages?: number;
}

export interface IngestOutlookCompanyEmailsResult {
  connectorProvider: 'ONEDRIVE' | 'SHAREPOINT';
  connectorSource: 'tenant' | 'system';
  mailboxUserId: string;
  scannedMessages: number;
  matchedEmails: string[];
  importedEmails: string[];
  skippedExistingEmails: string[];
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const tokenCache = new Map<string, TokenCacheEntry>();

// Generic company suffix/stop words that are too broad for matching.
const COMPANY_STOP_WORDS = new Set([
  'the',
  'and',
  'of',
  'pte',
  'ltd',
  'private',
  'limited',
  'llp',
  'llc',
  'inc',
  'corp',
  'corporation',
  'co',
  'company',
  'holdings',
  'group',
  'sg',
  'singapore',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export function buildCompanyMatchTokens(companyName: string): string[] {
  const tokens = normalizeText(companyName)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !COMPANY_STOP_WORDS.has(token));

  return [...new Set(tokens)];
}

function collectParticipants(message: GraphMessage): Array<{ email: string; name: string; subject: string }> {
  const participants: Array<{ email: string; name: string; subject: string }> = [];
  const subject = message.subject ?? '';
  const participantGroups = [
    message.from ? [message.from] : [],
    message.sender ? [message.sender] : [],
    message.replyTo ?? [],
    message.toRecipients ?? [],
    message.ccRecipients ?? [],
    message.bccRecipients ?? [],
  ];

  for (const group of participantGroups) {
    for (const participant of group) {
      const rawEmail = participant?.emailAddress?.address;
      if (!rawEmail || typeof rawEmail !== 'string') {
        continue;
      }

      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) {
        continue;
      }

      participants.push({
        email,
        name: participant?.emailAddress?.name ?? '',
        subject,
      });
    }
  }

  return participants;
}

export function extractMatchingEmailsFromMessages(
  messages: GraphMessage[],
  options: { companyName: string; domains?: string[]; excludeEmails?: string[] }
): string[] {
  const tokens = buildCompanyMatchTokens(options.companyName);
  const companyNeedle = compactText(options.companyName);

  const normalizedDomains = new Set(
    (options.domains ?? [])
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
  );

  const excludedEmails = new Set(
    (options.excludeEmails ?? [])
      .map((email) => normalizeEmail(email))
      .filter(isValidEmail)
  );

  const matched = new Set<string>();

  for (const message of messages) {
    const participants = collectParticipants(message);

    for (const participant of participants) {
      if (excludedEmails.has(participant.email)) {
        continue;
      }

      const domain = participant.email.split('@')[1] ?? '';
      if (domain && normalizedDomains.has(domain)) {
        matched.add(participant.email);
        continue;
      }

      const context = normalizeText(
        `${participant.name} ${participant.email} ${participant.subject}`
      );

      if (companyNeedle.length >= 4 && compactText(context).includes(companyNeedle)) {
        matched.add(participant.email);
        continue;
      }

      if (tokens.length === 0) {
        continue;
      }

      const tokenMatches = tokens.reduce(
        (count, token) => count + (context.includes(token) ? 1 : 0),
        0
      );
      const minMatches = tokens.length >= 3 ? 2 : 1;

      if (tokenMatches >= minMatches) {
        matched.add(participant.email);
      }
    }
  }

  return [...matched].sort();
}

function getGraphCredentials(credentials: Record<string, unknown>): MicrosoftGraphCredentials {
  const clientId = typeof credentials.clientId === 'string' ? credentials.clientId.trim() : '';
  const clientSecret =
    typeof credentials.clientSecret === 'string' ? credentials.clientSecret.trim() : '';
  const tenantId = typeof credentials.tenantId === 'string' ? credentials.tenantId.trim() : '';

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Microsoft connector credentials are incomplete');
  }

  return { clientId, clientSecret, tenantId };
}

function getMailboxUserId(
  explicitMailboxUserId: string | undefined,
  settings: unknown
): string | null {
  const fromInput = explicitMailboxUserId?.trim();
  if (fromInput) {
    return fromInput;
  }

  if (settings && typeof settings === 'object') {
    const mailboxFromSettings = (settings as Record<string, unknown>).mailboxUserId;
    if (typeof mailboxFromSettings === 'string' && mailboxFromSettings.trim()) {
      return mailboxFromSettings.trim();
    }
  }

  if (process.env.EMAIL_FROM_ADDRESS?.trim()) {
    return process.env.EMAIL_FROM_ADDRESS.trim();
  }

  return null;
}

async function getGraphAccessToken(credentials: MicrosoftGraphCredentials): Promise<string> {
  const cacheKey = `${credentials.tenantId}:${credentials.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Reuse a valid token with a 5-minute safety window.
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as {
      error?: string;
      error_description?: string;
    };
    throw new Error(
      errorData.error_description || errorData.error || 'Failed to acquire Microsoft access token'
    );
  }

  const payload = await response.json() as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error('Microsoft token response is missing access token');
  }

  tokenCache.set(cacheKey, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000,
  });

  return payload.access_token;
}

async function fetchOutlookMessages(
  credentials: MicrosoftGraphCredentials,
  mailboxUserId: string,
  lookbackDays: number,
  maxMessages: number
): Promise<GraphMessage[]> {
  const token = await getGraphAccessToken(credentials);
  const take = clamp(maxMessages, 1, 500);
  const pageSize = Math.min(take, 100);
  const lookbackDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    '$select': 'subject,from,sender,toRecipients,ccRecipients,bccRecipients,replyTo',
    '$orderby': 'receivedDateTime DESC',
    '$top': String(pageSize),
    '$filter': `receivedDateTime ge ${lookbackDate}`,
  });

  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUserId)}/messages?${params.toString()}`;

  const messages: GraphMessage[] = [];

  while (nextUrl && messages.length < take) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as {
        error?: { message?: string };
      };
      throw new Error(errorData.error?.message || 'Failed to fetch Outlook messages');
    }

    const payload = await response.json() as {
      value?: GraphMessage[];
      '@odata.nextLink'?: string;
    };

    const pageItems = payload.value ?? [];
    for (const item of pageItems) {
      messages.push(item);
      if (messages.length >= take) {
        break;
      }
    }

    nextUrl = payload['@odata.nextLink'] ?? null;
  }

  return messages;
}

export async function ingestOutlookCompanyEmails(
  input: IngestOutlookCompanyEmailsInput
): Promise<IngestOutlookCompanyEmailsResult> {
  const company = await prisma.company.findFirst({
    where: {
      id: input.companyId,
      tenantId: input.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const resolvedConnector =
    (await resolveConnector(input.tenantId, 'STORAGE', 'ONEDRIVE')) ??
    (await resolveConnector(input.tenantId, 'STORAGE', 'SHAREPOINT'));

  if (!resolvedConnector) {
    throw new Error('No Microsoft connector found. Configure OneDrive or SharePoint first.');
  }

  const credentials = getGraphCredentials(resolvedConnector.connector.credentials);
  const mailboxUserId = getMailboxUserId(
    input.mailboxUserId,
    resolvedConnector.connector.settings
  );

  if (!mailboxUserId) {
    throw new Error(
      'Mailbox user is required. Pass mailboxUserId or configure connector settings.mailboxUserId.'
    );
  }

  const lookbackDays = clamp(input.lookbackDays ?? 180, 1, 3650);
  const maxMessages = clamp(input.maxMessages ?? 200, 1, 500);

  const messages = await fetchOutlookMessages(
    credentials,
    mailboxUserId,
    lookbackDays,
    maxMessages
  );

  const matchedEmails = extractMatchingEmailsFromMessages(messages, {
    companyName: company.name,
    domains: input.domains,
    excludeEmails: [mailboxUserId],
  });

  const existingDetails = await prisma.contactDetail.findMany({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      contactId: null,
      detailType: 'EMAIL',
      deletedAt: null,
    },
    select: {
      value: true,
    },
  });

  const existingEmailSet = new Set(existingDetails.map((detail) => normalizeEmail(detail.value)));
  const skippedExistingEmails = matchedEmails.filter((email) => existingEmailSet.has(email));
  const newEmails = matchedEmails.filter((email) => !existingEmailSet.has(email));

  const importedEmails: string[] = [];
  for (const email of newEmails) {
    await createContactDetail(
      {
        companyId: input.companyId,
        detailType: 'EMAIL',
        value: email,
        label: 'Outlook Imported',
        description: `Imported from Outlook mailbox ${mailboxUserId}`,
        displayOrder: existingDetails.length + importedEmails.length,
      },
      {
        tenantId: input.tenantId,
        userId: input.userId,
      }
    );

    importedEmails.push(email);
  }

  try {
    await incrementConnectorUsage(resolvedConnector.connector.id);
  } catch (error) {
    log.warn('Failed to increment connector usage', {
      connectorId: resolvedConnector.connector.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  log.info('Outlook email ingestion completed', {
    companyId: input.companyId,
    connectorId: resolvedConnector.connector.id,
    mailboxUserId,
    scannedMessages: messages.length,
    matchedCount: matchedEmails.length,
    importedCount: importedEmails.length,
  });

  return {
    connectorProvider: resolvedConnector.connector.provider as 'ONEDRIVE' | 'SHAREPOINT',
    connectorSource: resolvedConnector.source,
    mailboxUserId,
    scannedMessages: messages.length,
    matchedEmails,
    importedEmails,
    skippedExistingEmails,
  };
}
