const { createTransport } = require('nodemailer');


// Отправка писем через SMTP, повторяет SmtpMailSender из mail-server
class SmtpMailSender {
  constructor (config) {
    this.transport = createTransport({
      auth: config.auth,
      host: config.host,
      pool: true,
      port: config.port,
      secure: config.secure
    }, {
      from: config.from
    });
  }

  close () {
    this.transport.close();
  }

  async sendEmail (email) {
    await this.transport.sendMail({
      attachments: email.attachments,
      headers: email.headers,
      html: email.html,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.html ? undefined : email.text,
      to: email.receivers.map(receiver => receiver.email).join(', ')
    });
  }
}

module.exports = SmtpMailSender;
