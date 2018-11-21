const moment = require('moment');
const { Email } = require('mail-server/server/dist/Email');


class HumanMessageHandler {
  constructor (logger, mailSender, config) {
    this.logger = logger;
    this.mailSender = mailSender;

    this.forwardTo = config.forwardTo;
    this.maxForwardDays = config.maxForwardDays;
  }

  async processMessage (message) {
    const actions = [];
    const age = moment().diff(moment(message.date), 'days');
    const notOld = (age <= this.maxForwardDays);

    if (notOld && this.forwardTo) {
      await this._forwardMessage(message);
      actions.push(`forwarded to ${this.forwardTo}`);
    }
    
    return {
      performedActions: actions,
      reason: `Human message${notOld ? '' : ', too old'}`,
      skipped: false
    };
  }

  async _forwardMessage (message) {
    await this.mailSender.sendEmail(new Email({
      attachments: message.attachments,
      headers: {},
      html: message.html,
      receivers: [{
        email: this.forwardTo
      }],
      replyTo: message.replyToAddress || message.fromAddress,
      subject: 'Fwd: ' + message.subject,
      text: message.text
    }));
  }
}

module.exports = HumanMessageHandler;
