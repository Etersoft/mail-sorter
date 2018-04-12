require('./src/runCli')(class {
  setAddressStatus (address, status, fullStatus) {
    return {
      performedActions: [`set addr ${address} status = ${status} (DSN status: ${fullStatus})`],
      reason: 'received DSN',
      skipped: false
    };
  }
});
