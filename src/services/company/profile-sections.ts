import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import {
  computeSectionVersion,
  type CompanyProfileSectionId,
} from '@/lib/company-profile-sections';
import { buildFullAddress } from '@/services/bizfile/normalizer';
import {
  companyProfileSectionSchemas,
  type CompanyProfileSectionData,
} from '@/lib/validations/company-profile';

const profileCompanyArgs = {
  include: {
    addresses: { orderBy: { createdAt: 'asc' } },
    formerNames: { orderBy: { effectiveFrom: 'asc' } },
    officers: { orderBy: { appointmentDate: 'asc' } },
    shareholders: { orderBy: { createdAt: 'asc' } },
    shareCapital: { orderBy: { createdAt: 'asc' } },
    charges: { orderBy: { registrationDate: 'asc' } },
    auditor: true,
  },
} satisfies Prisma.CompanyDefaultArgs;
type ProfileCompany = Prisma.CompanyGetPayload<typeof profileCompanyArgs>;
type Tx = Prisma.TransactionClient;

export interface CompanyProfileSectionDto<T = CompanyProfileSectionData> {
  section: CompanyProfileSectionId;
  version: string;
  data: T;
}

export interface SaveCompanyProfileSectionArgs<T = unknown> {
  companyId: string;
  tenantId: string;
  userId: string;
  section: CompanyProfileSectionId;
  ifMatchVersion: string;
  data: T;
  reason?: string;
}

export class CompanyProfileConflictError<T = CompanyProfileSectionData> extends Error {
  readonly code = 'COMPANY_PROFILE_CONFLICT';
  constructor(public readonly latest: CompanyProfileSectionDto<T>) {
    super('This section changed after you opened it');
  }
}

export class CompanyProfileNotFoundError extends Error {
  readonly code = 'COMPANY_PROFILE_NOT_FOUND';
}

function date(value: Date | null | undefined): string | null {
  return value ? value.toISOString().split('T')[0] : null;
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function selectSection(company: ProfileCompany, section: CompanyProfileSectionId): CompanyProfileSectionData {
  switch (section) {
    case 'identity': return {
      uen: company.uen,
      name: company.name,
      entityType: company.entityType,
      status: company.status,
      statusDate: date(company.statusDate),
      incorporationDate: date(company.incorporationDate),
    };
    case 'addresses': {
      const mapAddress = (type: 'REGISTERED_OFFICE' | 'MAILING') => {
        const address = company.addresses.find((item) => item.addressType === type && item.isCurrent);
        return address ? {
          block: address.block,
          streetName: address.streetName,
          level: address.level,
          unit: address.unit,
          buildingName: address.buildingName,
          postalCode: address.postalCode,
          country: address.country,
          ...(type === 'REGISTERED_OFFICE' ? { effectiveFrom: date(address.effectiveFrom) } : {}),
        } : null;
      };
      return { registered: mapAddress('REGISTERED_OFFICE'), mailing: mapAddress('MAILING') };
    }
    case 'activities': return {
      primary: company.primarySsicCode || company.primarySsicDescription
        ? { code: company.primarySsicCode ?? '', description: company.primarySsicDescription ?? '' }
        : null,
      secondary: company.secondarySsicCode || company.secondarySsicDescription
        ? { code: company.secondarySsicCode ?? '', description: company.secondarySsicDescription ?? '' }
        : null,
    };
    case 'officers': return { officers: company.officers.map((officer) => ({
      id: officer.id,
      name: officer.name,
      role: officer.role,
      identificationType: officer.identificationType,
      identificationNumber: officer.identificationNumber,
      nationality: officer.nationality,
      address: officer.address,
      appointmentDate: date(officer.appointmentDate),
      cessationDate: date(officer.cessationDate),
      isCurrent: officer.isCurrent,
    })) };
    case 'shareholders': return { shareholders: company.shareholders.map((shareholder) => ({
      id: shareholder.id,
      name: shareholder.name,
      shareholderType: shareholder.shareholderType,
      identificationType: shareholder.identificationType,
      identificationNumber: shareholder.identificationNumber,
      nationality: shareholder.nationality,
      placeOfOrigin: shareholder.placeOfOrigin,
      address: shareholder.address,
      shareClass: shareholder.shareClass,
      numberOfShares: shareholder.numberOfShares,
      percentageHeld: shareholder.percentageHeld == null ? null : Number(shareholder.percentageHeld),
      currency: shareholder.currency,
      isCurrent: shareholder.isCurrent,
    })) };
    case 'compliance': return {
      financialYearEndDay: company.financialYearEndDay,
      financialYearEndMonth: company.financialYearEndMonth,
      fyeAsAtLastAr: date(company.fyeAsAtLastAr),
      homeCurrency: company.homeCurrency,
      lastAgmDate: date(company.lastAgmDate),
      lastArFiledDate: date(company.lastArFiledDate),
      accountsDueDate: date(company.accountsDueDate),
    };
    case 'capital': return {
      paidUpCapitalCurrency: company.paidUpCapitalCurrency,
      paidUpCapitalAmount: company.paidUpCapitalAmount == null ? null : Number(company.paidUpCapitalAmount),
      issuedCapitalCurrency: company.issuedCapitalCurrency,
      issuedCapitalAmount: company.issuedCapitalAmount == null ? null : Number(company.issuedCapitalAmount),
      shareCapital: company.shareCapital.map((capital) => ({
        id: capital.id,
        shareClass: capital.shareClass,
        currency: capital.currency,
        numberOfShares: capital.numberOfShares,
        parValue: capital.parValue == null ? null : Number(capital.parValue),
        totalValue: Number(capital.totalValue),
        isPaidUp: capital.isPaidUp,
        isTreasury: capital.isTreasury,
      })),
    };
    case 'charges': return { charges: company.charges.map((charge) => ({
      id: charge.id,
      chargeNumber: charge.chargeNumber,
      chargeType: charge.chargeType,
      description: charge.description,
      chargeHolderName: charge.chargeHolderName,
      amountSecured: charge.amountSecured == null ? null : Number(charge.amountSecured),
      amountSecuredText: charge.amountSecuredText,
      currency: charge.currency,
      registrationDate: date(charge.registrationDate),
      dischargeDate: date(charge.dischargeDate),
      isFullyDischarged: charge.isFullyDischarged,
    })) };
    case 'additional': return {
      formerName: company.formerName,
      dateOfNameChange: date(company.dateOfNameChange),
      registrationDate: date(company.registrationDate),
      formerNames: company.formerNames.map((record) => ({
        id: record.id,
        formerName: record.formerName,
        effectiveFrom: date(record.effectiveFrom)!,
        effectiveTo: date(record.effectiveTo),
      })),
      auditor: company.auditor ? {
        name: company.auditor.name,
        address: company.auditor.address,
        appointmentDate: date(company.auditor.appointmentDate),
      } : null,
    };
  }
}

async function readCompany(
  companyId: string,
  tenantId: string,
  db: Pick<Tx, 'company'> | typeof prisma,
): Promise<ProfileCompany> {
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    ...profileCompanyArgs,
  });
  if (!company) throw new CompanyProfileNotFoundError('Company not found');
  return company as ProfileCompany;
}

export async function getCompanyProfileSection<T = CompanyProfileSectionData>(
  companyId: string,
  tenantId: string,
  section: CompanyProfileSectionId,
  db: Pick<Tx, 'company'> | typeof prisma = prisma,
): Promise<CompanyProfileSectionDto<T>> {
  const data = selectSection(await readCompany(companyId, tenantId, db), section) as T;
  return { section, version: computeSectionVersion(data), data };
}

async function replaceAddress(
  tx: Tx,
  companyId: string,
  type: 'REGISTERED_OFFICE' | 'MAILING',
  input: Record<string, unknown> | null,
) {
  const current = await tx.companyAddress.findFirst({
    where: { companyId, addressType: type, isCurrent: true },
    select: { id: true },
  });
  if (!input) {
    if (current) await tx.companyAddress.deleteMany({ where: { id: current.id } });
    return;
  }
  const address = input as {
    block?: string | null; streetName: string; level?: string | null; unit?: string | null;
    buildingName?: string | null; postalCode: string; country: string; effectiveFrom?: string | null;
  };
  const values = {
    block: address.block ?? null,
    streetName: address.streetName,
    level: address.level ?? null,
    unit: address.unit ?? null,
    buildingName: address.buildingName ?? null,
    postalCode: address.postalCode,
    country: address.country,
    fullAddress: buildFullAddress({
      block: address.block ?? undefined,
      streetName: address.streetName,
      level: address.level ?? undefined,
      unit: address.unit ?? undefined,
      buildingName: address.buildingName ?? undefined,
      postalCode: address.postalCode,
    }),
    effectiveFrom: dateOrNull(address.effectiveFrom),
    effectiveTo: null,
    isCurrent: true,
  };
  if (current) await tx.companyAddress.update({ where: { id: current.id }, data: values });
  else await tx.companyAddress.create({ data: { companyId, addressType: type, ...values } });
}

export async function mutateCompanyProfileSection(tx: Tx, companyId: string, section: CompanyProfileSectionId, rawData: unknown) {
  const data = companyProfileSectionSchemas[section].parse(rawData) as Record<string, any>;
  switch (section) {
    case 'identity':
      await tx.company.update({ where: { id: companyId }, data: {
        uen: data.uen, name: data.name, entityType: data.entityType, status: data.status,
        statusDate: dateOrNull(data.statusDate), incorporationDate: dateOrNull(data.incorporationDate),
      } });
      break;
    case 'addresses':
      await replaceAddress(tx, companyId, 'REGISTERED_OFFICE', data.registered);
      await replaceAddress(tx, companyId, 'MAILING', data.mailing);
      break;
    case 'activities':
      await tx.company.update({ where: { id: companyId }, data: {
        primarySsicCode: data.primary?.code ?? null,
        primarySsicDescription: data.primary?.description ?? null,
        secondarySsicCode: data.secondary?.code ?? null,
        secondarySsicDescription: data.secondary?.description ?? null,
      } });
      break;
    case 'compliance':
      await tx.company.update({ where: { id: companyId }, data: {
        financialYearEndDay: data.financialYearEndDay,
        financialYearEndMonth: data.financialYearEndMonth,
        fyeAsAtLastAr: dateOrNull(data.fyeAsAtLastAr),
        homeCurrency: data.homeCurrency,
        lastAgmDate: dateOrNull(data.lastAgmDate),
        lastArFiledDate: dateOrNull(data.lastArFiledDate),
        accountsDueDate: dateOrNull(data.accountsDueDate),
      } });
      break;
    case 'officers':
      await tx.companyOfficer.deleteMany({ where: { companyId } });
      for (const officer of data.officers) await tx.companyOfficer.create({ data: {
        companyId, name: officer.name, role: officer.role,
        identificationType: officer.identificationType, identificationNumber: officer.identificationNumber,
        nationality: officer.nationality, address: officer.address,
        appointmentDate: dateOrNull(officer.appointmentDate), cessationDate: dateOrNull(officer.cessationDate),
        isCurrent: officer.isCurrent ?? !officer.cessationDate,
      } });
      await tx.company.update({ where: { id: companyId }, data: { currentOfficerCount: data.officers.filter((item: any) => item.isCurrent ?? !item.cessationDate).length } });
      break;
    case 'shareholders':
      await tx.companyShareholder.deleteMany({ where: { companyId } });
      for (const shareholder of data.shareholders) await tx.companyShareholder.create({ data: {
        companyId, name: shareholder.name, shareholderType: shareholder.shareholderType,
        identificationType: shareholder.identificationType, identificationNumber: shareholder.identificationNumber,
        nationality: shareholder.nationality, placeOfOrigin: shareholder.placeOfOrigin, address: shareholder.address,
        shareClass: shareholder.shareClass, numberOfShares: shareholder.numberOfShares,
        percentageHeld: shareholder.percentageHeld, currency: shareholder.currency,
        isCurrent: shareholder.isCurrent ?? true,
      } });
      await tx.company.update({ where: { id: companyId }, data: { currentShareholderCount: data.shareholders.filter((item: any) => item.isCurrent ?? true).length } });
      break;
    case 'capital':
      await tx.company.update({ where: { id: companyId }, data: {
        paidUpCapitalCurrency: data.paidUpCapitalCurrency, paidUpCapitalAmount: data.paidUpCapitalAmount,
        issuedCapitalCurrency: data.issuedCapitalCurrency, issuedCapitalAmount: data.issuedCapitalAmount,
      } });
      await tx.shareCapital.deleteMany({ where: { companyId } });
      for (const capital of data.shareCapital) await tx.shareCapital.create({ data: {
        companyId, shareClass: capital.shareClass, currency: capital.currency,
        numberOfShares: capital.numberOfShares, parValue: capital.parValue,
        totalValue: capital.totalValue, isPaidUp: capital.isPaidUp, isTreasury: capital.isTreasury,
      } });
      break;
    case 'charges':
      await tx.companyCharge.deleteMany({ where: { companyId } });
      for (const charge of data.charges) await tx.companyCharge.create({ data: {
        companyId, chargeNumber: charge.chargeNumber, chargeType: charge.chargeType,
        description: charge.description, chargeHolderName: charge.chargeHolderName,
        amountSecured: charge.amountSecured, amountSecuredText: charge.amountSecuredText,
        currency: charge.currency, registrationDate: dateOrNull(charge.registrationDate),
        dischargeDate: dateOrNull(charge.dischargeDate),
        isFullyDischarged: charge.isFullyDischarged ?? Boolean(charge.dischargeDate),
      } });
      await tx.company.update({ where: { id: companyId }, data: {
        hasCharges: data.charges.some((item: any) => !(item.isFullyDischarged ?? item.dischargeDate)),
        activeChargeCount: data.charges.filter((item: any) => !(item.isFullyDischarged ?? item.dischargeDate)).length,
      } });
      break;
    case 'additional':
      await tx.company.update({ where: { id: companyId }, data: {
        formerName: data.formerName, dateOfNameChange: dateOrNull(data.dateOfNameChange),
        registrationDate: dateOrNull(data.registrationDate),
      } });
      await tx.companyFormerName.deleteMany({ where: { companyId } });
      for (const record of data.formerNames) await tx.companyFormerName.create({ data: {
        companyId, formerName: record.formerName, effectiveFrom: dateOrNull(record.effectiveFrom)!, effectiveTo: dateOrNull(record.effectiveTo),
      } });
      if (data.auditor) await tx.companyAuditor.upsert({ where: { companyId }, create: {
        companyId, name: data.auditor.name, address: data.auditor.address,
        appointmentDate: dateOrNull(data.auditor.appointmentDate),
      }, update: {
        name: data.auditor.name, address: data.auditor.address,
        appointmentDate: dateOrNull(data.auditor.appointmentDate),
      } });
      else await tx.companyAuditor.deleteMany({ where: { companyId } });
      break;
  }
}

export async function saveCompanyProfileSection<T = CompanyProfileSectionData>(
  args: SaveCompanyProfileSectionArgs<T>,
): Promise<CompanyProfileSectionDto<T>> {
  return prisma.$transaction(async (tx) => {
    const current = await getCompanyProfileSection<T>(args.companyId, args.tenantId, args.section, tx);
    if (current.version !== args.ifMatchVersion) throw new CompanyProfileConflictError(current);
    await mutateCompanyProfileSection(tx, args.companyId, args.section, args.data);
    await tx.auditLog.create({ data: {
      tenantId: args.tenantId,
      userId: args.userId,
      companyId: args.companyId,
      action: 'UPDATE',
      entityType: 'CompanyProfileSection',
      entityId: `${args.companyId}:${args.section}`,
      changeSource: 'MANUAL',
      reason: args.reason,
      summary: `Updated company ${args.section}`,
    } });
    return getCompanyProfileSection<T>(args.companyId, args.tenantId, args.section, tx);
  });
}
