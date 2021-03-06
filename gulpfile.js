'use strict';

var gulp = require('gulp');

/**
 * Files that need to be ignored by all linting tasks.
 */
var lintIgnore = [
    'dist/**',
    'node_modules/**',
    'tmp/**'
];

var mediaTypeUtil = (function () {
    var _ = require('lodash'),
        mimeDB = require('mime-db'),
        MediaType = require('media-type');

    /**
     * @param {string} mediaType
     * @return {Array<string>}
     */
    function getMediaTypeExtensions(mediaType)
    {
        // TODO: Is this really necessary?
        var normalized = MediaType.fromString(mediaType).asString();

        return mimeDB[normalized] && mimeDB[normalized].extensions || [];
    }

    /**
     * @param {string} mediaType
     * @return {boolean}
     */
    function isJSON(mediaType)
    {
        var type = MediaType.fromString(mediaType);

        return type.type === 'application'
            && (type.subtype === 'json' || type.suffix === 'json');
    }

    /**
     * @param {string} mediaType
     * @return {Array<string>}
     */
    function globMediaType(mediaType)
    {
        return getExtensionsPattern(getMediaTypeExtensions(mediaType));
    }

    /**
     * @param {Array<string>} extensions
     * @return {string}
     */
    function getExtensionsPattern(extensions)
    {
        // Sort the file extensions alphabetically for readability
        extensions = [].concat(extensions).sort();

        return extensions.length > 1
            ? '**/*.{' + extensions + '}'
            : extensions.length === 1
            ? '**/*.' + extensions[0]
            : '';
    }

    /**
     * Match `application/json` and `application/*.json`.
     *
     * @return {string}
     */
    function getJSONPattern()
    {
        var jsonDefs = _.filter(mimeDB, function (item, type) {
            return isJSON(type);
        });

        var extensions = _.flatten(_.map(jsonDefs, function (item) {
            return item.extensions || [];
        }));

        return getExtensionsPattern(extensions);
    }

    return {
        isJSON:               isJSON,
        getExtensionsPattern: getExtensionsPattern,
        getJSONPattern:       getJSONPattern,
        globMediaType:        globMediaType
    };
}());

/**
 * Create a string prepend function.
 *
 * @param {string} prefix
 * @return {function(string):string}
 */
function prependWith(prefix)
{
    return function prepend(str)
    {
        return prefix + str;
    };
}

/**
 * Pre-configured version of `gulp.src` for finding files for linting.
 * @param {string} pattern
 */
function src(pattern)
{
    var ignore = lintIgnore.map(prependWith('!'));

    var args = typeof pattern === 'string' ? [pattern] : pattern;

    args = args.concat(ignore);

    return gulp.src(args, { 'base': './' });
}

// Gulp task `lint:closure-compiler`
(function () {
    var closure = require('google-closure-compiler'),
        _ = require('lodash');

    var closureCompiler = closure.gulp();

    // TODO: Load copyright line from `license.txt` and output it inside a comment
    var license = '(c) ' + new Date().getFullYear() + ' All rights reserved.';

    var closureSettings = {
        'compilation_level':    'ADVANCED_OPTIMIZATIONS',
        'language_in':          'ECMASCRIPT5_STRICT',
        'warning_level':        'VERBOSE',
        'charset':              'UTF-8',
        'summary_detail_level': 3,

        'use_types_for_optimization': null,
        'new_type_inf':               null,
        'assume_function_wrapper':    null,

        'externs': [
            'node_modules/nih-externs/lib/amd.js'
        ],

        'output_wrapper': '/** @license ' + license + ' */void function(){%output%}();'
    };

    gulp.task('lint:closure-compiler', function ()
    {
        var lintSettings = {
            'checks_only': null
        };

        lintSettings = _.merge({}, closureSettings, lintSettings);

        return src('./src/' + mediaTypeUtil.globMediaType('application/javascript'))
            .pipe(closureCompiler(lintSettings));
    });
}());

// Gulp task `lint:package-json`
(function () {
    var _ = require('lodash'),
        _gulp = require('gulp-util'),
        through = require('through2'),
        packageValidator = require('package-json-validator');

    var PluginError = _gulp.PluginError,
        pluginName = 'validate-package';

    var lintSettings = {
        'spec':            'npm',
        'warnings':        true,
        'recommendations': true
    };

    /**
     * @param {Object} result
     */
    function formatError(result)
    {
        var msg = '';

        if (!result.valid)
        {
            msg += 'package.json is NOT valid!';
        }

        if (!_.isEmpty(result.errors))
        {
            msg += LF + result.errors.join(LF) + LF;
        }

        if (!_.isEmpty(result.recommendations))
        {
            msg += 'Please fix the following recommendations in package.json:' + LF;
            msg += result.recommendations.join(LF);
        }

        return msg;
    }

    /**
     * @param {Object} settings
     * @return {Stream}
     */
    function packageValidatorPlugin(settings)
    {
        var spec = settings.spec || 'json';

        /**
         * @param {Object} file
         * @param {string} enc
         * @param {function(?Error, ?Object)} cb
         */
        function streamValidator(file, enc, cb)
        {
            var result,
                LF = '\n',
                msg = '',
                err = null;

            if (file.isBuffer())
            {
                result = packageValidator.PJV.validate(file.contents.toString('UTF-8'), spec, settings);
            }
            else if (file.isStream())
            {
                err = new PluginError(pluginName, 'Streams are not supported.');
            }

            if (result && (!result.valid || lintSettings.recommendations && !_.isEmpty(result.recommendations)))
            {
                err = new PluginError(pluginName, formatError(result));
            }

            cb(err, file);
        }

        // Creating a stream through which each file will pass:
        return through.obj(streamValidator);
    }

    gulp.task('lint:package-json', function () {
        return src('package.json')
            .pipe(packageValidatorPlugin(lintSettings));
    });
}());


// Gulp task `lint:yaml`
(function () {
    var _ = require('lodash'),
        _gulp = require('gulp-util'),
        through = require('through2'),
        yaml = require('js-yaml');

    var PluginError = _gulp.PluginError,
        pluginName = 'validate-yaml';

    /**
     * @return {Stream}
     */
    function yamlValidatorPlugin()
    {
        /**
         * @param {Object} file
         * @param {string} enc
         * @param {function(Error, Object)} cb
         */
        function streamValidator(file, enc, cb)
        {
            var contents,
                LF = '\n',
                msg = '',
                err = null;

            if (file.isBuffer())
            {
                try
                {
                    contents = file.contents.toString('UTF-8');
                    yaml.safeLoad(contents);
                }
                catch (e)
                {
                    err = new PluginError(pluginName, e.message);
                }
            }
            else if (file.isStream())
            {
                err = new PluginError(pluginName, 'Streams are not supported.');
            }

            cb(err, file);
        }

        return through.obj(streamValidator);
    }

    gulp.task('lint:yaml', function () {
        return src('**/*.yml')
            .pipe(yamlValidatorPlugin());
    });
}());

// Gulp task `lint:json`
(function () {
    var _gulp = require('gulp-util'),
        through = require('through2');

    var PluginError = _gulp.PluginError,
        pluginName = 'validate-json';

    // TODO: Use streaming JSON parse to reduce memory usage.
    /**
     * @return {Stream}
     */
    function jsonValidatorPlugin()
    {
        /**
         * @param {Object} file
         * @param {string} enc
         * @param {function(?Error, ?Object)} cb
         */
        function streamValidator(file, enc, cb)
        {
            var contents,
                err = null;

            if (file.isBuffer())
            {
                try
                {
                    contents = file.contents.toString('UTF-8');

                    JSON.parse(contents);
                }
                catch (e)
                {
                    err = new PluginError(pluginName, 'JSON syntax error in ' + file.path + '\n' + e.message);
                }
            }
            else if (file.isStream())
            {
                err = new PluginError(pluginName, 'Streams are not supported.');
            }

            cb(err, file);
        }

        return through.obj(streamValidator);
    }

    gulp.task('lint:json', function () {
        return src(mediaTypeUtil.getJSONPattern())
            .pipe(jsonValidatorPlugin());
    });
}());

// Gulp task `lint:filename`
(function () {
    var _ = require('lodash'),
        _gulp = require('gulp-util'),
        through = require('through2'),
        sanitize = require('sanitize-filename');

    var PluginError = _gulp.PluginError,
        pluginName = 'validate-filename',
        MAX_FILENAME_LENGTH = 32;

    /**
     * @return {Stream}
     */
    function filenameValidatorPlugin()
    {
        /**
         * @param {Object} file
         * @param {string} enc
         * @param {function(?Error, ?Object)} cb
         */
        function streamValidator(file, enc, cb)
        {
            var msg,
                err = null,
                filename = file.path.replace(/^.+\//, '');

            if (sanitize(filename) !== filename)
            {
                err = new PluginError(pluginName, 'Filename not allowed: ' + filename);
            }

            if (filename.length > MAX_FILENAME_LENGTH)
            {
                msg = 'Filename too long: ' + filename
                    + ' (length: ' + filename.length
                    + ', max: ' + MAX_FILENAME_LENGTH
                    + ')';

                err = new PluginError(pluginName, msg);
            }

            cb(err, file);
        }

        return through.obj(streamValidator);
    }

    gulp.task('lint:filename', function () {
        return src('**')
            .pipe(filenameValidatorPlugin());
    });
}());

// Gulp task `lint:editorconfig`
(function () {
    var _ = require('lodash'),
        lintspaces = require('gulp-lintspaces');

    var options = {
        'editorconfig': '.editorconfig',
        'ignores':      ['js-comments']
    };


    gulp.task('lint:editorconfig', function () {
        return src('**')
            .pipe(lintspaces(options))
            .pipe(lintspaces.reporter());
    });
}());

// Gulp task `lint:html-validator`
(function () {
    var validator = require('gulp-html');

    gulp.task('lint:html-validator', function () {
        return src(['application/xhtml+xml', 'text/html'].map(mediaTypeUtil.globMediaType))
            .pipe(validator());
    });
}());

// Gulp task `lint:html`
(function () {
    var jsdom = require('jsdom'),
        _gulp = require('gulp-util'),
        through = require('through2');

    var PluginError = _gulp.PluginError,
        pluginName = 'html';

    // Prevent security vulnerabilities by access to external sources
    jsdom.defaultDocumentFeatures = {
        FetchExternalResources:   false,
        ProcessExternalResources: false
    };

    /**
     * @param {Document} document
     */
    function lint(document)
    {
        if (!document.querySelector('html[lang]'))
        {
            throw new Error('Missing lang attribute on root element.');
        }

        // TODO: Switch to `meta[charset=UTF-8 i]` when jsdom supports this new CSS Selectors 4 feature
        if (!document.querySelector('meta[charset=UTF-8]'))
        {
            throw new Error('Missing <meta charset="UTF-8">');
        }
    }

    /**
     * @return {Stream}
     */
    function lintPlugin()
    {
        /**
         * @param {Object} file
         * @param {string} enc
         * @param {function(?Error, ?Object)} cb
         */
        function streamValidator(file, enc, cb)
        {
            var err = null,
                contents;

            if (file.isBuffer())
            {
                try
                {
                    contents = file.contents.toString('UTF-8');

                    jsdom.env(
                        contents,
                        function (err, window) {
                            lint(window.document);
                        }
                    );
                }
                catch (e)
                {
                    err = new PluginError(pluginName, e.message);
                }
            }
            else if (file.isStream())
            {
                err = new PluginError(pluginName, 'Streams are not supported.');
            }

            cb(err, file);
        }

        return through.obj(streamValidator);
    }

    gulp.task('lint:html', function () {
        return src('**/*.html')
            .pipe(lintPlugin());
    });
}());

// Gulp task `lint:chmod`
(function () {
    var fs = require('fs'),
        _gulp = require('gulp-util'),
        through = require('through2');

    var PluginError = _gulp.PluginError,
        pluginName = 'chmod',
        OCTAL_0777 = parseInt('0777', 8);

    var settings = {
        dir:  parseInt('0755', 8),
        file: parseInt('0644', 8)
    };

    /**
     * @param {Object} settings
     * @return {Stream}
     */
    function permissionValidatorPlugin(settings)
    {
        /**
         * @param {Object} file
         * @param {string} enc
         * @param {function(?Error, ?Object)} cb
         */
        function streamValidator(file, enc, cb)
        {
            var msg,
                filename = file.path.replace(/^.+\//, '');

            fs.lstat(file.path, function (e, stat) {
                var msg, err;

                if (e)
                {
                    msg = 'Couldn\'t read file permissions: ' + e.message;
                }
                else if (stat.isDirectory() && (stat.mode & OCTAL_0777) !== settings.dir)
                {
                    msg = 'Directory permissions not valid for: ' + file.path
                        + 'Expected: ' + settings.dir.toString(8)
                        + '. Found: ' + (stat.mode & OCTAL_0777).toString(8);
                }
                else if (stat.isFile() && (stat.mode & OCTAL_0777) !== settings.file)
                {
                    msg = 'File permissions not valid for: ' + file.path
                        + '\nExpected: ' + settings.file.toString(8)
                        + '\nFound: ' + (stat.mode & OCTAL_0777).toString(8);
                }

                err = e || msg ? new PluginError(pluginName, msg) : null;

                cb(err, file);
            });
        }

        return through.obj(streamValidator);
    }

    gulp.task('lint:chmod', function () {
        return src('**')
            .pipe(permissionValidatorPlugin(settings));
    });
}());

// Gulp task `lint:css`
(function () {
    var csslint = require('gulp-csslint');

    gulp.task('lint:css', function () {
        return src(mediaTypeUtil.globMediaType('text/css'))
            .pipe(csslint('.csslintrc.json'))
            .pipe(csslint.reporter());
    });
}());

// Gulp task `lint:eslint`
(function () {
    var eslint = require('gulp-eslint');

    // Some rules conflict with Closure Compiler annotations, disable those
    // for continuous integration builds, simply show them as warnings during
    // development in your favorite editor.
    //
    // - Only show `no-unused-expressions` warnings during development
    // - Only show `no-extra-parens` warnings during development
    var lintSettings = {
        'rules': {
            'no-extra-parens':       ['off'],
            'no-unused-expressions': ['off']
        }
    };

    gulp.task('lint:eslint', function () {
        return src(mediaTypeUtil.globMediaType('application/javascript'))
            .pipe(eslint(lintSettings))
            .pipe(eslint.formatEach('compact', process.stderr));
    });
}());
