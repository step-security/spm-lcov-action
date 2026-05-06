const core = require('@actions/core')
const exec = require('@actions/exec')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

const ALLOWED_FORMATS = ['lcov', 'text']

function validateFormat(format) {
    if (!ALLOWED_FORMATS.includes(format)) {
        throw new Error(
            `Invalid file-format "${format}". Allowed values: ${ALLOWED_FORMATS.join(', ')}`
        )
    }
    return format
}

function validateOutputPath(output) {
    if (typeof output !== 'string' || output.length === 0) {
        throw new Error('output-file must be a non-empty string')
    }
    if (/[\x00-\x1f]/.test(output) || /[;&|`$<>"'\\*?(){}\[\]!#]/.test(output)) {
        throw new Error('output-file contains disallowed characters')
    }
    if (path.isAbsolute(output)) {
        throw new Error('output-file must be a relative path')
    }
    const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd())
    const resolved = path.resolve(workspace, output)
    if (resolved !== workspace && !resolved.startsWith(workspace + path.sep)) {
        throw new Error('output-file must remain within the workspace')
    }
    return output
}

async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = "maxep/spm-lcov-action";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');

  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body = { action: action || "" };

  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 },
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(
          '\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m'
      );
      core.error(
          `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

async function main() {
    await validateSubscription()
    const format = validateFormat(core.getInput('file-format'))
    const output = validateOutputPath(core.getInput('output-file'))
    await exec.exec(`${__dirname}/cov.sh`, ['-f', format, '-o', output])
}

main().catch(err => core.setFailed(err.message))
