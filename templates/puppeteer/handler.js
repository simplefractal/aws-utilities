const { NewPuppeteerBot } = require('./newPuppeteerBot');
const { BaseBot } = require('../../common/puppeteer_utils/base');

// Exports serve as entry points to different serverless functions for this portal.
module.exports.getClaimData = async (event, context) => {
  const args = {
    dryRun: event.dryRun || false,
    portal: 'portalName',
    baseUrl: 'https://www.portalBaseUrl.com/'
  };

  const claimParams = {
    policy,
    dateOfBirth,
    dateOfService,
    billedAmount
  }

  return BaseBot.launch(NewPuppeteerBot, args, (bot) => bot.cmdGetClaimData(claimParams));
};
