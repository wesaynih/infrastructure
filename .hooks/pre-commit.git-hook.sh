#!/usr/bin/env bash

# Workaround for SourceTree, when it can't find `npm`
export PATH="/usr/local/bin:${PATH}"

npm test
