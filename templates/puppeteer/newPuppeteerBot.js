const { BaseBot, baseCmdArgs } = require('../../common/puppeteer_utils/base')

class newPortalBot extends BaseBot {
  constructor(client, args, log) {
    super(client, args, log)
    this.page = this.client.page
  }

  // --- ENTRY POINTS --
  async cmdGetClaimData(claimParams) {
    this.log.info(claimParams)
    await this.login(claimParams)
  }

  // --- FUNCTION LOGIC --
  async login() {
    await this.page.goto('https://example-portal.com/login')
    const username = process.env[`USERNAME`];
    const password = process.env[`PASSWORD`];
    assert(username, `Make sure USERNAME is set`);
    assert(password, `Make sure PASSWORD is set`);
    return "done"
  }

  async runFromTerminal() {
    const command = {
      ['get-claim-data']: this.cmdGetClaimData,
    }[this.args._]

    if (!command) throw new Error('Invalid Command');
    return command.bind(this)(this.args);
  }
}

// --- COMMAND LINE HANDLING --

function args() {
  // Use this space to define uncommon, portal-specific command line arguments
  return baseCmdArgs()
}

/* Export API, mainly for testing purposes */
module.exports.newPortalBot = newPortalBot;

/* Make it a command line program if launched interactively */
if (!module.parent) BaseBot.launch(newPortalBot, args(), (bot) => bot.runFromTerminal());

