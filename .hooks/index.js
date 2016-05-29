'use strict';

var childProcess = require('child_process'),
    fs = require('fs');

var exec = childProcess.exec;

/** @const {RegExp} Match "#123" in a commit message */
var GITHUB_ISSUE_REFERENCE = /#(\d+)(\b|$)/;

var hooks = {
    'commit-msg': function ()
    {
        var path = process.argv[3],
            message = fs.readFileSync(path, { encoding: 'utf8' }),
            branch = getCurrentBranch();

        validateMessage(message, branch);
    },
    'prepare-commit-msg': function ()
    {
        var path = process.argv[3],
            message = fs.readFileSync(path, { encoding: 'utf8' }),
            branch = getCurrentBranch(),
            update = prepareMessage(message, branch);

        if (update)
        {
            fs.writeFileSync(path, update);
        }
    }
};

try
{
    init();
}
catch (e)
{
    process.stderr.write('Error: ' + e.message);
    process.exit(1);
}

/**
 * Run Git hooks based on command line arguments.
 */
function init()
{
    var out = '',
        hook = process.argv[2];

    if (hooks.hasOwnProperty(hook))
    {
        out = hooks[hook]();
    }

    if (out)
    {
        process.stdout.write(out);
    }

    process.exit(0);
}

/**
 * Use `git` to find out the current branch.
 *
 * @return {string}
 */
function getCurrentBranch()
{
    return childProcess.execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' });
}

/**
 * Require "Changed something #123" style commit messages.
 *
 * @param {string} message Commit message
 * @param {string} branch Name of current branch
 */
function validateMessage(message, branch)
{
    var reference = getIssueFromMessage(message);

    if (!reference)
    {
        reference = getIssueFromBranch(branch);
    }

    if (!reference)
    {
        throw new Error('Commit message must include a reference to a GitHub issue.');
    }
}

/**
 * Create "Changed something #123" style commit messages.
 *
 * @param {string} message Commit message
 * @param {?string} branch Name of current branch
 */
function prepareMessage(message, branch)
{
    var update = null,
        reference = getIssueFromMessage(message);

    if (!reference)
    {
        reference = getIssueFromBranch(branch);

        if (reference)
        {
            reference = ' #' + reference;

            // Append the reference to the end of the first line
            update = message.replace(/(\s*)(\r?\n|$)/, reference + '$2');
        }
    }

    return update;
}

/**
 * Find issue identifier in "Changed something #123" style commit messages.
 *
 * @param {string} message Commit message
 * @return {?string} Issue identifier
 */
function getIssueFromMessage(message)
{
    var match = GITHUB_ISSUE_REFERENCE.exec(message);

    return match && match[1];
}

/**
 * @param {string} Branch name
 * @return {?string} Issue reference
 */
function getIssueFromBranch(branch)
{
    var match = /(?:issue|bug|feature)-(\d+)/.exec(branch);

    return match && match[1];
}
