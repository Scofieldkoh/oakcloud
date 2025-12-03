/**
 * Email Test Script
 *
 * Run with: npx tsx scripts/test-email.ts
 */

import 'dotenv/config';
import { sendEmail, isEmailConfigured, verifyEmailConnection, getActiveEmailProvider } from '../src/lib/email';

async function testEmail() {
  console.log('=== Email Configuration Test ===\n');

  // Check if email is configured
  console.log('1. Checking email configuration...');
  if (!isEmailConfigured()) {
    console.error('❌ Email is NOT configured. Please check your .env file.');
    console.log('\nRequired environment variables:');
    console.log('  - SMTP_HOST');
    console.log('  - SMTP_USER');
    console.log('  - SMTP_PASSWORD');
    process.exit(1);
  }
  console.log('✅ Email configuration found\n');

  // Display current config
  const provider = getActiveEmailProvider();
  console.log(`2. Active provider: ${provider.toUpperCase()}\n`);

  if (provider === 'graph') {
    console.log('   Microsoft Graph API settings:');
    console.log(`   Tenant ID: ${process.env.AZURE_TENANT_ID}`);
    console.log(`   Client ID: ${process.env.AZURE_CLIENT_ID}`);
    console.log(`   From: ${process.env.EMAIL_FROM_ADDRESS}`);
    console.log(`   Name: ${process.env.EMAIL_FROM_NAME || 'Oakcloud'}\n`);
  } else if (provider === 'smtp') {
    console.log('   SMTP settings:');
    console.log(`   Host: ${process.env.SMTP_HOST}`);
    console.log(`   Port: ${process.env.SMTP_PORT || '587'}`);
    console.log(`   User: ${process.env.SMTP_USER}`);
    console.log(`   From: ${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}`);
    console.log(`   Name: ${process.env.EMAIL_FROM_NAME || 'Oakcloud'}\n`);
  }

  // Verify connection
  console.log(`3. Verifying ${provider} connection...`);
  const isConnected = await verifyEmailConnection();
  if (!isConnected) {
    console.error(`❌ Failed to connect to ${provider} provider.`);
    if (provider === 'graph') {
      console.log('\nPossible issues:');
      console.log('  - Incorrect Tenant ID, Client ID, or Client Secret');
      console.log('  - Missing Mail.Send permission');
      console.log('  - Admin consent not granted');
      console.log('  - FROM address is not a valid mailbox');
    } else {
      console.log('\nPossible issues:');
      console.log('  - Incorrect host/port');
      console.log('  - Wrong username/password');
      console.log('  - Firewall blocking connection');
      console.log('  - Need App Password if MFA is enabled');
    }
    process.exit(1);
  }
  console.log(`✅ ${provider.toUpperCase()} connection verified\n`);

  // Send test email
  const testRecipient = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER;
  console.log(`4. Sending test email to: ${testRecipient}`);

  const result = await sendEmail({
    to: testRecipient!,
    subject: '✅ Oakcloud Email Test - Success!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background-color: #294d44; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Oakcloud</h1>
        </div>
        <div style="background-color: #ffffff; border: 1px solid #e2e4e9; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1a1d23; margin-top: 0;">Email Test Successful! 🎉</h2>
          <p style="color: #333; line-height: 1.6;">
            This is a test email from your Oakcloud installation. If you're reading this,
            your email configuration is working correctly.
          </p>
          <div style="background-color: #f0f9f6; border: 1px solid #c6e5dc; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0; color: #294d44;"><strong>Configuration Details:</strong></p>
            <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #333;">
              <li>SMTP Host: ${process.env.SMTP_HOST}</li>
              <li>SMTP Port: ${process.env.SMTP_PORT || '587'}</li>
              <li>Sent at: ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          <p style="color: #666; font-size: 14px;">
            You can now use all email features including password resets and user invitations.
          </p>
        </div>
        <p style="text-align: center; color: #888; font-size: 12px; margin-top: 24px;">
          © ${new Date().getFullYear()} Oakcloud. All rights reserved.
        </p>
      </div>
    `,
  });

  if (result.success) {
    console.log('✅ Test email sent successfully!');
    console.log(`   Message ID: ${result.messageId}\n`);
    console.log('=== All tests passed! Email is ready to use. ===');
  } else {
    console.error('❌ Failed to send test email:', result.error);
    process.exit(1);
  }
}

// Run the test
testEmail().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
