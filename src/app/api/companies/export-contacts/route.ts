import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getContactDetailsForExport } from '@/services/contact-detail.service';
import { exportContactDetailsSchema } from '@/lib/validations/contact-detail';
import { ZodError } from 'zod';
import ExcelJS from 'exceljs';

/**
 * POST /api/companies/export-contacts
 * Export contact details for selected companies to Excel
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check export permission (tenant-level since this spans multiple companies)
    await requirePermission(session, 'company', 'export');

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();

    // Parse and validate input
    const { companyIds } = exportContactDetailsSchema.parse(body);

    // Verify access to all companies
    for (const companyId of companyIds) {
      if (!(await canAccessCompany(session, companyId))) {
        return NextResponse.json(
          { error: `Access denied to company ${companyId}` },
          { status: 403 }
        );
      }
    }

    // Get export data
    const exportData = await getContactDetailsForExport(companyIds, tenantId);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Oakcloud';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Contact Details');

    // Define columns
    worksheet.columns = [
      { header: 'Company Name', key: 'companyName', width: 30 },
      { header: 'UEN', key: 'companyUen', width: 15 },
      { header: 'Contact Name', key: 'contactName', width: 25 },
      { header: 'Relationship', key: 'relationship', width: 20 },
      { header: 'Type', key: 'detailType', width: 12 },
      { header: 'Value', key: 'value', width: 35 },
      { header: 'Label', key: 'label', width: 20 },
      { header: 'Primary', key: 'isPrimary', width: 10 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF294D44' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data rows
    for (const detail of exportData) {
      worksheet.addRow({
        companyName: detail.companyName,
        companyUen: detail.companyUen,
        contactName: detail.contactName || '(Company-level)',
        relationship: detail.relationship || '-',
        detailType: formatDetailType(detail.detailType),
        value: detail.value,
        label: detail.label || '-',
        isPrimary: detail.isPrimary ? 'Yes' : 'No',
      });
    }

    // Add alternating row colors
    for (let i = 2; i <= worksheet.rowCount; i++) {
      if (i % 2 === 0) {
        worksheet.getRow(i).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF7FBFA' },
        };
      }
    }

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E4E9' } },
          left: { style: 'thin', color: { argb: 'FFE2E4E9' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E4E9' } },
          right: { style: 'thin', color: { argb: 'FFE2E4E9' } },
        };
      });
    });

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `contact-details-${timestamp}.xlsx`;

    // Return the file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Error exporting contact details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function formatDetailType(type: string): string {
  const typeMap: Record<string, string> = {
    EMAIL: 'Email',
    PHONE: 'Phone',
    FAX: 'Fax',
    MOBILE: 'Mobile',
    WEBSITE: 'Website',
    OTHER: 'Other',
  };
  return typeMap[type] || type;
}
