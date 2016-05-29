#!/usr/bin/env bash

cd .hooks

# Copy all Git hooks to the `.git/hooks` directory, with filename extensions removed.
for file in *.git-hook.sh; do

    # Clean up any existing symbolic links
    rm -f "../.git/hooks/${file%%.git-hook.sh}"

    cp "$file" "../.git/hooks/${file%%.git-hook.sh}"
done
