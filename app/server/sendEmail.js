const nodemailer = require("nodemailer");

/**
 * Send an email using ZeptoMail SMTP
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Subject line
 * @param {string} [options.text] - Plain text version
 * @param {string} [options.html] - HTML content (preferred)
 * @param {Array} [options.attachments] - Attachments if any
 */
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  try {
    console.log("📧 [sendEmail] Starting email send...");
    console.log("📧 [sendEmail] To:", to);
    console.log("📧 [sendEmail] Subject:", subject);
    console.log("📧 [sendEmail] Has attachments:", !!attachments);
    if (attachments && attachments.length > 0) {
      attachments.forEach((att, i) => {
        console.log(`📧 [sendEmail] Attachment ${i + 1}:`, {
          filename: att.filename,
          contentType: att.contentType,
          size: att.content?.length || "unknown"
        });
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.zeptomail.eu",
      port: 587,
      secure: false, 
      auth: {
        user: process.env.ZEPTO_USER, 
        pass: process.env.ZEPTO_PASS, 
      },

      authMethod: "PLAIN"

    });

    const mailOptions = {
      from: `"PDFify Team" <mailer@pdfify.pro>`,
      to,
      subject,
      text,
      html: html || text, 
      attachments,
    };

    await transporter.sendMail(mailOptions);

    if (process.env.NODE_ENV !== "production") {
      console.log(`✅ Email sent successfully to: ${to}`);
    }
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
};

module.exports = sendEmail;
