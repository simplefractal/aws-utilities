const assert = require('assert');
const fs = require('fs');
const path = require('path');
const url = require('url');
const util = require('util');
const P = util.promisify;
const yargs = require('yargs');

const bunyan = require('bunyan');
const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const SQS = new AWS.SQS({apiVersion: '2012-11-05'});


// Timeouts for operations that wait for elements to show on the page
// or for HTTP requests. It's currently set to 1.5min
const LONG_WAIT = 90000;

// Disable headlessness & enable devtools
const debug = false;

/** Runs a bot within a browser page. Add common web driver functions here. */
class BrowserPage {
  constructor(log) {
    this.exit = process.exit;  // To make it easy to mock
    this.log = log;
    // To be initialized by createPage()
    this._browser = null;
    this._page = null;
  }

  get page() {
    if (this._page === null) throw new Error("Please call .createPage");
    return this._page;
  }

  /** Open up browser and page and set initial configuration */
  async createPage() {

    // Defaults to local chromium specified in env var
    const executablePath = await chromium.executablePath ||
      process.env['CHROMIUM_EXECUTABLE_PATH'];
    // Parameters for launching the puppet
    const LAUNCH_PARAMETERS = {
      executablePath,
      args: chromium.args,
      headless: chromium.headless
    };

    this._browser = await puppeteer.launch(LAUNCH_PARAMETERS);
    // Doesn't start another page.
    ([this._page,] = await this._browser.pages());
    // Help debugging scripts that run within the page
    this._page.on('console', msg => this.evt('pagelog', msg.text()));
    // Force recalculating dimensions so viewport of page is update to
    // the window size (without it the browser's viewport look smaller
    // than my screen)
    await this._page._client.send('Emulation.clearDeviceMetricsOverride');
  }

  /** Close page and browser instances. */
  async closePage() {
    try {
      await this._page.close();
      await this._browser.close();
    } catch (error) {
      // Although it's not a really important error since we're all
      // done at this point, it's still worth knowing about the
      // fact. It could help finding clues about why other problems
      // happen.
      this.err(error);
    }
  }

  // General Utilities

  /** Logging facility */
  evt(event, type, fields) {
    this.log.debug({ event, type, ...fields });
  }

  /** Requests process to shutdown */
  err(error, event, extra) {
    let params = {};
    if (event) params = { event, ...params };
    if (extra) params = { ...params, ...extra };
    if (this.paymentId) params = { ...params, paymentId: this.paymentId};
    if (this.labelId) params = { ...params, labelId: this.labelId};
    if (this.billingEntryId) params = { ...params, billingEntryId: this.billingEntryId};
    this.log.error(error, params);
    this.exit(1);
  }

  // Navigation utilities

  /** Shortcut for waiting for the end of the navigation. */
  async waitNavigation(operation) {
    // The code below means that we'll trigger both actions together
    // and we won't move forward til we get the response of both.
    return Promise.all([
      operation,
      this.page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: LONG_WAIT,
      }),
    ]);
  }

  /** Wait until `SELECTOR' is present in `PAGE' or fail if doesn't
   * show up after a while. */
  async requireSelector(selector, options = { timeout: LONG_WAIT }) {
    this.evt('selector', 'request', { selector });
    try {
      const element = await this.page.waitForSelector(selector, options);
      this.evt('selector', 'response', { selector });
      return element;
    } catch (error) {
      this.err(error, 'selector', { selector });
      return null;
    }
  }

  /** Open ADDRESS in PAGE and wait til page navigates to it. */
  async goto(address) {
    this.evt('page', 'request', { address });
    try {
      await this.waitNavigation(this.page.goto(address));
      this.evt('page', 'response', { address });
    } catch (error) {
      this.err(error, 'page', { address });
    }
  }

  /** Fill field informed in SELECTOR with CONTENT */
  async fill(selector, ct) {
    const content = selector.indexOf('password') > 0 ? '***' : ct;
    this.evt('fill', 'request', { selector, content });
    const opt = { timeout: LONG_WAIT, visible: true };
    try {
      const field = await this.page.waitForSelector(selector, opt);
      await field.type(ct);
      this.evt('fill', 'response', { selector, content });
    } catch (error) {
      this.err(error, 'fill', { selector, content });
    }
  }

  /** Click SELECTOR and wait til PAGE navigates to new location. */
  async click(selector) {
    this.evt('click', 'request', { selector });
    const opt = { timeout: LONG_WAIT, visible: true };
    try {
      const button = await this.page.waitForSelector(selector, opt);
      await button.click();
      this.evt('click', 'response', { selector });
    } catch (error) {
      this.err(error, 'click', { selector });
    }
  }

  /** Fetch remote JSON content starting from the pages context */
  async json(address, params) {
    const jsonBody = params.body ? JSON.parse(params.body) : {};
    this.evt('json', 'request', { address, ...jsonBody });
    try {
      const content = await this.page.evaluate(async (addr, params) => {
        const response = await window.fetch(addr, params);
        return response.json();
      }, address, params);
      this.evt('json', 'response', { address });
      return content;
    } catch (error) {
      this.err(error, 'json', { address });
      return null;
    }
  }

  /** Evaluate Java Script code within the current page */
  async js(fn, params=[]) {
    return this.page.evaluate(fn, ...params);
  }

  /** Get innerHTML value of an element based on its selector. */
  async getInnerHTML(selector) {
    this.evt('getInnerHTML', { selector });
    try {
      const element = await this.page.$(selector);
      const innerHTML = await this.page.evaluate(el => el.innerHTML, element);
      await element.dispose();
      return innerHTML;
    } catch (error) {
      this.err(error, 'getInnerHTML', { selector });
      return null;
    }
  }
}

/** Encode a dictionary into a URL query string.
 *
 * @example:
 * urlencode({ a: 1, b: "oi"})
 * // Output "a=1&b=oi"
 * @returns {String} Query string without question mark.
 */
const urlencode = (o) => (
  Object
    .keys(o)
    .reduce((a, k) => a.push(`${k}=${encodeURIComponent(o[k])}`) && a, [])
    .join('&'));

/** Wrap methods from ALP's backend exposed by BrowserPage */
class BaseBot {
  constructor(client, args, log) {
    // Save parameters as instance properties
    this.client = client;
    this.args = args;
    this.log = log;
    // When dryRun is enabled, endpoints that perform database changes
    // will do nothing but log what should have happened.
    const { dryRun } = args;
    this.dryRun = dryRun === undefined || dryRun;
    this.writeAPI = (this.dryRun
                     ? client.noop
                     : client.api).bind(client);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // --- Initialization of bot execution ---

  /** Create a new bot instance and kick it off */
  static async launch({ botClass, args, callback }) {
    // Command line arguments cleaned up from yargs properties that
    // are useless for us here.
    const cleanArgs = cleanCommandLineArgs(args);
    // The dryRun flag is used in every single bot and its state is
    // global to the bot execution. So it makes sense to capture that
    // here and log it in every single log message.
    const { dryRun, baseUrl } = cleanArgs;
    // Logging instance. All the log calls in this file are going to
    // be filed against the DEBUG level, which is the standard. The
    // log calls from within the bot classes will use info.
    const log = bunyan.createLogger({
      name: `alp.${botClass.name}`,
      level: bunyan.DEBUG,
      dryRun,
      baseUrl,
    });
    // Client for making authenticated RESTful API calls
    const client = new BrowserPage(baseUrl, log);
    // Bot instance is created receiving the command line arguments
    // specified in the `args()` class method.
    const bot = new botClass(client, args, log);
    // Log boot parameters
    log.info({ event: 'boot', args: cleanArgs });

    try {
      // Initialize the client
      await client.createPage();
      await client.login();
      // Run the callback with the bot as the parameter
      await callback(bot);
      // Cleanup
      await client.closePage();
    } catch (error) {
      client.err(error);
      await client.closePage();
    }
  }
}

/** Only keep command line arguments that should be displayed */
function cleanCommandLineArgs(args) {
  return Object
    .keys(args)
    .filter(k =>
            (k.length > 1 || k === '_') && // All single chars besides _
            k.indexOf('-') === -1 &&       // Everything with a dash
            !k.startsWith('$'))            // Command name
    .reduce((r, k) => {
      r[k] = args[k];
      return r;
    }, {});
}
exports.cleanCommandLineArgs = cleanCommandLineArgs;

/** Base arguments that all command line programs share */
function baseCmdArgs() {
  return yargs
    .usage('Usage: $0 [options] <command> [command-options]')
  // -h,--help
    .alias('h', 'help')
    .help('h')
  // -c,--cache, used for tests/debugging
    .option('c', {
      alias: 'cache',
      type: 'boolean',
      describe: 'Use local cache for READ operations',
      default: false,
      nargs: 0,
    })
  // -d,--dry-run
    .option('d', {
      alias: 'dry-run', // becomes dryRun after yargs
      type: 'boolean',
      describe: 'Never execute WRITE operations',
      default: true,
      nargs: 1,
    })
  // -b,--base-url
    .option('b', {
      alias: 'base-url',
      type: 'string',
      describe: 'Base URL for website being accessed',
      default: 'https://simplefractal.com',
      nargs: 1,
    })
  // Commands
    .demandCommand(1, "must provide a valid command");
}

exports.baseCmdArgs = baseCmdArgs;
exports.BrowserPage = BrowserPage;
exports.BaseBot = BaseBot;
