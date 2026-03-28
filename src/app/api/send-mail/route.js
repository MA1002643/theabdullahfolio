import nodemailer from "nodemailer";

export async function POST(req) {
    try {
        const { name, email, subject, message } = await req.json();

        if (!name || !email || !subject || !message) {
            return new Response(
                JSON.stringify({ error: "All fields are required." }),
                { status: 400 }
            );
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
            from: `"Portfolio Form" <${process.env.SMTP_USER}>`,
            to: process.env.RECEIVER_EMAIL, // your inbox
            subject: `📩 New Message: ${subject}`,
            html: `
        <div style="font-family:Arial, sans-serif; line-height:1.6;">
          <h2>New Message from Portfolio Form</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        </div>
      `,
        });

        return new Response(
            JSON.stringify({ success: true, message: "Email sent successfully!" }),
            { status: 200 }
        );
    } catch (err) {
        console.error("Error sending email:", err);
        return new Response(
            JSON.stringify({ error: "Failed to send email." }),
            { status: 500 }
        );
    }
}
