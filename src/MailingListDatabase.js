class MailingListDatabase {
  setAddressStatus (address, status, metadata) {
    console.log(`${address}: set status = ${status}`);
  }
}

module.exports = MailingListDatabase;
