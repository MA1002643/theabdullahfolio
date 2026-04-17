import nodemailer from 'nodemailer';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req) {
  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !subject || !message) {
      return new Response(
        JSON.stringify({ error: 'All fields are required.' }),
        { status: 400 },
      );
    }

    // Reject inputs containing CR/LF to prevent header injection
    if (/[\r\n]/.test(name) || /[\r\n]/.test(subject)) {
      return new Response(
        JSON.stringify({ error: 'Input contains invalid characters.' }),
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format.' }), {
        status: 400,
      });
    }

    // Verify email deliverability via Abstract Email Reputation API
    if (process.env.ABSTRACT_API_KEY) {
      const controller = new AbortController();
      const timeoutMs = 5000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const abstractRes = await fetch(
          `https://emailreputation.abstractapi.com/v1/?api_key=${process.env.ABSTRACT_API_KEY}&email=${encodeURIComponent(email)}`,
          { signal: controller.signal },
        );

        if (abstractRes.ok) {
          const validation = await abstractRes.json();
          if (validation.email_deliverability?.status === 'undeliverable') {
            return new Response(
              JSON.stringify({
                error:
                  'This email address does not exist or cannot receive emails.',
              }),
              { status: 400 },
            );
          }
          if (validation.email_quality?.is_disposable) {
            return new Response(
              JSON.stringify({
                error: 'Disposable email addresses are not allowed.',
              }),
              { status: 400 },
            );
          }
        } else {
          console.warn('Abstract API non-ok:', abstractRes.status);
        }
      } catch (abstractErr) {
        console.warn('Skipping Abstract email reputation check:', abstractErr);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 🔒 Set up transporter using your SMTP credentials
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g. "smtp.gmail.com"
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // true for 465, false for others
      auth: {
        user: process.env.SMTP_USER, // your email
        pass: process.env.SMTP_PASS, // app password or SMTP password
      },
    });

    // 📧 Send email
    await transporter.sendMail({
      from: { name: 'ma.codes Contact Form', address: process.env.SMTP_USER },
      replyTo: { name, address: email },
      to: process.env.RECEIVER_EMAIL, // your inbox
      subject: `${subject.slice(0, 200)} (ma.codes contact form)`,
      text: `From: ${name} <${email}>\nFull Name: ${name}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family:Arial, sans-serif; line-height:1.6;">
          <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
          <p><strong>Full Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        </div>
      `,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully!' }),
      { status: 200 },
    );
  } catch (err) {
    console.error('Error sending email:', err);
    return new Response(JSON.stringify({ error: 'Failed to send email.' }), {
      status: 500,
    });
  }
}
