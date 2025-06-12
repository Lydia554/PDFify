const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, text, attachments }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      attachments, 
    };

    await transporter.sendMail(mailOptions);

    if (process.env.NODE_ENV !== "production") {
      console.log("Email sent successfully to:", to);
    }
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = sendEmail;
