import { prisma } from '@/lib/prisma';
import {
  buildPartyContactFields,
  type DocumentParty,
} from '@/lib/document-party';

export interface DocumentPartySelections {
  selectedDirector?: DocumentParty;
  selectedShareholder?: DocumentParty;
  selectedContact?: DocumentParty;
}

const contactSelect = {
  id: true,
  fullName: true,
  contactType: true,
  fullAddress: true,
  contactDetails: {
    where: { deletedAt: null },
    select: {
      detailType: true,
      value: true,
      companyId: true,
      isPrimary: true,
      displayOrder: true,
      createdAt: true,
    },
  },
} as const;

export async function getDocumentPartyOptions(
  companyId: string,
  tenantId: string,
) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: {
      id: true,
      officers: {
        where: { isCurrent: true, role: 'DIRECTOR' },
        select: {
          id: true,
          contactId: true,
          name: true,
          role: true,
          nationality: true,
          identificationNumber: true,
          address: true,
          appointmentDate: true,
          contact: { select: contactSelect },
        },
      },
      shareholders: {
        where: { isCurrent: true },
        select: {
          id: true,
          contactId: true,
          name: true,
          shareholderType: true,
          nationality: true,
          identificationNumber: true,
          shareClass: true,
          numberOfShares: true,
          percentageHeld: true,
          address: true,
          contact: { select: contactSelect },
        },
      },
      contacts: {
        where: { deletedAt: null },
        select: {
          relationship: true,
          contact: { select: contactSelect },
        },
      },
    },
  });

  if (!company) throw new Error('Company not found');

  const toParty = (record: {
    id: string;
    contactId?: string | null;
    name: string;
    detail: string | null;
    roleAddress?: string | null;
    roleFields?: Partial<
      Pick<
        DocumentParty,
        | 'nationality'
        | 'identificationNumber'
        | 'role'
        | 'appointmentDate'
        | 'shareholderType'
        | 'shareClass'
        | 'numberOfShares'
        | 'percentageHeld'
      >
    >;
    contact?: {
      id: string;
      fullName: string;
      contactType: string;
      fullAddress: string | null;
      contactDetails: Array<{
        detailType: string;
        value: string;
        companyId: string | null;
        isPrimary: boolean;
        displayOrder: number;
        createdAt: Date;
      }>;
    } | null;
  }): DocumentParty => ({
    id: record.id,
    contactId: record.contactId ?? record.contact?.id ?? null,
    name: record.name,
    detail: record.detail,
    contactType: record.contact?.contactType ?? null,
    ...record.roleFields,
    ...buildPartyContactFields({
      companyId,
      roleAddress: record.roleAddress,
      contactAddress: record.contact?.fullAddress,
      contactDetails: record.contact?.contactDetails,
    }),
  });

  const directors = company.officers.map((officer) =>
    toParty({
      id: officer.id,
      contactId: officer.contactId,
      name: officer.name,
      detail: officer.role,
      roleAddress: officer.address,
      contact: officer.contact,
      roleFields: {
        role: officer.role,
        nationality: officer.nationality,
        identificationNumber: officer.identificationNumber,
        appointmentDate: officer.appointmentDate,
      },
    }),
  );
  const shareholders = company.shareholders.map((shareholder) =>
    toParty({
      id: shareholder.id,
      contactId: shareholder.contactId,
      name: shareholder.name,
      detail: shareholder.shareClass,
      roleAddress: shareholder.address,
      contact: shareholder.contact,
      roleFields: {
        shareholderType: shareholder.shareholderType,
        nationality: shareholder.nationality,
        identificationNumber: shareholder.identificationNumber,
        shareClass: shareholder.shareClass,
        numberOfShares: shareholder.numberOfShares,
        percentageHeld: shareholder.percentageHeld?.toString() ?? null,
      },
    }),
  );

  const contactMap = new Map<string, DocumentParty>();
  for (const relation of company.contacts) {
    const contact = relation.contact;
    contactMap.set(
      contact.id,
      toParty({
        id: contact.id,
        contactId: contact.id,
        name: contact.fullName,
        detail: relation.relationship,
        contact,
      }),
    );
  }
  for (const party of [...directors, ...shareholders]) {
    if (party.contactId && !contactMap.has(party.contactId)) {
      contactMap.set(party.contactId, { ...party, id: party.contactId });
    }
  }

  return {
    directors,
    shareholders,
    contacts: Array.from(contactMap.values()),
  };
}

export async function resolveDocumentPartySelections(input: {
  companyId: string;
  tenantId: string;
  selectedDirectorId?: string;
  selectedShareholderId?: string;
  selectedContactId?: string;
}): Promise<DocumentPartySelections> {
  const options = await getDocumentPartyOptions(input.companyId, input.tenantId);
  const selectedDirector = input.selectedDirectorId
    ? options.directors.find((party) => party.id === input.selectedDirectorId)
    : undefined;
  const selectedShareholder = input.selectedShareholderId
    ? options.shareholders.find(
        (party) => party.id === input.selectedShareholderId,
      )
    : undefined;
  const selectedContact = input.selectedContactId
    ? options.contacts.find((party) => party.id === input.selectedContactId)
    : undefined;

  if (input.selectedDirectorId && !selectedDirector) {
    throw new Error(
      'Selected director is not a current director of this company',
    );
  }
  if (input.selectedShareholderId && !selectedShareholder) {
    throw new Error(
      'Selected shareholder is not a current shareholder of this company',
    );
  }
  if (input.selectedContactId && !selectedContact) {
    throw new Error('Selected contact is not linked to this company');
  }

  return { selectedDirector, selectedShareholder, selectedContact };
}
